# 🧩 Bitespeed Identity Reconciliation Backend

A robust backend service built with **Node.js** and **PostgreSQL** to reconcile customer identities based on unique identifiers like email and phone number. Designed to unify fragmented customer data and deduplicate records with consistent business rules.

---

## 🚀 Features

- 🔗 **Identity Linking**: Unifies related contacts via email/phone
- 🔁 **Deduplication**: Prevents duplicates through normalization
- 📬 **Case & Whitespace Handling**: Emails are case-insensitive and trimmed
- 📡 **RESTful API**: Exposes a `/identify` POST endpoint for reconciliation
- 💾 **PostgreSQL Integration**: Stores structured contact data and relationships

---

## 📦 Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/bitespeed-identity-reconciliation.git
cd bitespeed-identity-reconciliation
```
### 2. Install Dependencies
```bash
npm install
```
### 3. Configure Environment Variables
- Create a .env file in the root directory with the following:
```.env
PORT=3000
DATABASE_URL=postgresql://youruser:yourpassword@localhost:5432/yourdb
```
- Never commit actual credentials to your repository.

### 4.  Set Up PostgreSQL
- Create the database and user:

```sql
CREATE DATABASE bitespeed;
CREATE USER projectuser WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE bitespeed TO projectuser;
```

- Create the contacts table:
```sql
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  phoneNumber VARCHAR(20),
  email VARCHAR(255),
  linkedId INTEGER REFERENCES contacts(id),
  linkPrecedence VARCHAR(10) CHECK (linkPrecedence IN ('primary', 'secondary')) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  deletedAt TIMESTAMP
);
```

## Business Logic Overview
- A new identifier (email/phone) creates a primary contact

- If an existing email or phone is found, links as secondary to the oldest primary

- All emails and phone numbers are stored once per unified contact

- Case-insensitive email comparison with whitespace trimming

- Fully idempotent – repeated requests won’t duplicate records

###  API Reference

#### POST /identify
- Request
```json
{
  "email": "a@b.com",
  "phoneNumber": "9898989898"
}
```

- Sample cURL
```bash
curl -X POST http://localhost:3000/identify \
-H "Content-Type: application/json" \
-d '{"email": "a@b.com", "phoneNumber": "9898989898"}'
```

- Response
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["a@b.com"],
    "phoneNumbers": ["9898989898"],
    "secondaryContactIds": []
  }
}
```
-  Sample Scenarios
1. New Contact
```json
POST { "email": "A@b.com", "phoneNumber": "123" }
```
- Creates a new primary contact (email normalized to a@b.com).

2. Merging Contacts
```json
POST { "email": "a@b.com", "phoneNumber": "456" }
```
- Adds phone 456 under existing primary a@b.com.

3. Case & Whitespace Handling
```json
POST { "email": "  A@B.com  " }
```
- Normalized to a@b.com, no duplicate created.

###  Development & Troubleshooting
- Use pgAdmin or psql for database inspection

- View all current contacts:
```sql
SELECT * FROM contacts;
```
- Start the server:
```bash
node server.js
```
- You'll see Server running at 3000 (or your specified port)

## Contributing
Pull requests are welcome!
Please make sure to:

- Never commit credentials or secrets

- Follow consistent code formatting and commit conventions

### Notes
Requires Node.js v14+ and PostgreSQL 11+

For production, add error handling, input validation, and logging

 Questions or Feedback?
Feel free to [open an issue](https://github.com/NamishM7/bitespeed-identity-reconciliation/issues) or submit a PR
