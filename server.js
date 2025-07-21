require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
app.use(bodyParser.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Utility: query DB
const query = (text, params) => pool.query(text, params);

/**
 * Find contacts by email/phone
 */
async function findContacts({ email, phoneNumber }) {
    if (!email && !phoneNumber) return [];
    const res = await query(
        `SELECT * FROM contacts WHERE (email = $1 AND $1 IS NOT NULL) OR (phoneNumber = $2 AND $2 IS NOT NULL)`,
        [email, phoneNumber]
    );
    return res.rows;
}

/**
 * Get all linked contacts (using DFS)
 */
async function getLinkedContacts(primaryId) {
    const res = await query(
        `SELECT * FROM contacts WHERE id = $1 OR linkedId = $1 ORDER BY id ASC`,
        [primaryId]
    );
    return res.rows;
}

/**
 * POST /identify
 */
app.post("/identify", async (req, res) => {
    try {
        let { email, phoneNumber } = req.body;

        // Normalize email: lowercased and trimmed (for uniqueness)
        const cleanEmail = email && email.trim().toLowerCase();
        // Use cleanEmail in all further logic, never 'email'

        // 1. Find any contacts with this email or phone
        let foundContacts = await findContacts({ email: cleanEmail, phoneNumber });

        if (foundContacts.length === 0) {
            // New contact, insert as "primary"
            const insert = await query(
                `INSERT INTO contacts (email, phoneNumber, linkPrecedence, createdAt, updatedAt) 
                 VALUES ($1, $2, 'primary', NOW(), NOW()) RETURNING *`,
                [cleanEmail, phoneNumber]
            );
            const contact = insert.rows[0];

            return res.json({
                contact: {
                    primaryContactId: contact.id,
                    emails: [contact.email].filter(Boolean),
                    phoneNumbers: [contact.phoneNumber].filter(Boolean),
                    secondaryContactIds: []
                }
            });
        }

        // 2. Merge if needed - get all unique primary contacts among foundContacts
        let primaries = foundContacts
            .map(c => (c.linkprecedence === 'primary' ? c : null))
            .filter(c => c);

        // If a found contact is secondary, get its primary
        for (const c of foundContacts) {
            if (c.linkprecedence === 'secondary') {
                const primaryRes = await query(`SELECT * FROM contacts WHERE id = $1`, [c.linkedid]);
                if (primaryRes.rows.length) {
                    primaries.push(primaryRes.rows[0]);
                }
            }
        }

        // Remove duplicates
        primaries = primaries.filter(
            (v, i, a) => a.findIndex(t => t.id === v.id) === i
        );

        // 3. Choose oldest primary as the real primary for potential merging
        let primaryContact = primaries.sort((a, b) => a.id - b.id)[0];

        // If there are multiple primaries, set newer ones to secondary & link to the oldest
        if (primaries.length > 1) {
            for (let i = 1; i < primaries.length; ++i) {
                if (primaries[i].id !== primaryContact.id) {
                    // Update this contact to secondary
                    await query(
                        `UPDATE contacts SET linkPrecedence='secondary', linkedId=$1, updatedAt=NOW() WHERE id=$2`,
                        [primaryContact.id, primaries[i].id]
                    );
                }
            }
        }

        // 4. If the given email/phone is new to the group, add as a secondary
        const allLinkedContactsRes = await getLinkedContacts(primaryContact.id);
        // Normalize all emails before checking for existence
        const allEmails = allLinkedContactsRes.map(c => c.email && c.email.trim().toLowerCase()).filter(Boolean);
        const allPhones = allLinkedContactsRes.map(c => c.phonenumber).filter(Boolean);

        let needsNewContact = false;
        if (cleanEmail && !allEmails.includes(cleanEmail)) needsNewContact = true;
        if (phoneNumber && !allPhones.includes(phoneNumber)) needsNewContact = true;

        if (needsNewContact) {
            await query(
                `INSERT INTO contacts (email, phoneNumber, linkPrecedence, linkedId, createdAt, updatedAt)
                 VALUES ($1, $2, 'secondary', $3, NOW(), NOW())`,
                [cleanEmail, phoneNumber, primaryContact.id]
            );
        }

        // 5. Gather all up-to-date contacts after possible new insert
        const contacts = await getLinkedContacts(primaryContact.id);
        const primary = contacts.find(c => c.linkprecedence === 'primary');
        const secondaryContactIds = contacts
            .filter(c => c.linkprecedence === 'secondary')
            .map(c => c.id);

        // Unique, sorted emails/phones (normalized for email)
        const emails = [
            ...new Set(
                contacts
                    .map(c => c.email && c.email.trim().toLowerCase())
                    .filter(Boolean)
            ),
        ];
        const phoneNumbers = [
            ...new Set(contacts.map(c => c.phonenumber).filter(Boolean)),
        ];

        res.json({
            contact: {
                primaryContactId: primary.id,
                emails,
                phoneNumbers,
                secondaryContactIds,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server running at", port);
});
