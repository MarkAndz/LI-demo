# Project Comments Demo

This is a simple Express.js application that lets you create **projects**, protect them with passwords, and manage **comments** per project with IBM Watson Natural Language Understanding (sentiment + emotion analysis). You can also bulk import comments from a text file and visualize emotion breakdowns in a pie chart.

---

## Features

* **Project management**: create, list, join (with password), and delete projects
* **Comment CRUD**: create, read, update, delete comments per project
* **Sentiment & Emotion**: uses IBM Watson NLU to analyze sentiment and emotion for each comment
* **Bulk import**: upload a `.txt` file to batch-add comments (one per line or paragraph blocks)
* **Visualization**: pie chart of emotion breakdown via Chart.js
* **Persistence**: data stored in `data/db.json` using [lowdb](https://github.com/typicode/lowdb)
* **HTTPS**: self-signed certificates for local TLS on port 8000, with HTTP→HTTPS redirect on port 3000

---

## Prerequisites

* Node.js (v14+)
* npm
* OpenSSL (for generating self-signed certs)

---

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/MarkAndz/LI-demo.git
   cd LI-demo
   ```

2. **Install dependencies**

   Run the following command to install all dependencies:

   ```bash
   npm install
   ```

3. **Create `.env`** file in the project root with the following content:
   **Create `.env`** file in the project root with the following content:

   ```env
   # IBM Natural Language Understanding
   IBM_NLU_APIKEY=your_nlu_api_key
   IBM_NLU_URL=https://api.YOUR_REGION.natural-language-understanding.watson.cloud.ibm.com/instances/YOUR_INSTANCE_ID
   ```

4. **Generate local HTTPS certificates** (for dev):

   ```bash
   mkdir certs && cd certs
   openssl req -nodes -new -x509 \
     -keyout key.pem \
     -out cert.pem \
     -days 365 \
     -subj "/CN=localhost"
   cd ..
   ```

   *Make sure `certs/` is in `.gitignore` to avoid committing private keys.*

5. **Initialize the data folder**

   ```bash
   mkdir data
   echo '{}' > data/db.json
   ```

---

## Running the App

Start the server:

```bash
node app.js
```

* HTTPS server: [https://localhost:8000](https://localhost:8000) (accept the self-signed cert warning)

Open your browser and navigate to **[https://localhost:8000](https://localhost:8000)**.

---

## Usage

1. **Create a project**: fill in a name and password (min 5 chars name, 8+ chars password with uppercase and digit).
2. **Join a project**: select from the dropdown and enter the project password.
3. **Manage comments**: add, edit, delete comments (min 50 chars), view sentiment & emotion.
4. **Bulk import**: upload a `.txt` file under "Upload comments file." Lines or blocks < 50 chars are skipped.
5. **Delete project**: click 🗑️ to remove the project and all its comments.

---

## API Endpoints

* `POST /projects` — create a new project

* `GET  /projects` — list all projects

* `DELETE /projects/:projectId` — delete a project + its comments

* `GET    /projects/:projectId/comments` — list comments + avg sentiment

* `POST   /projects/:projectId/comments` — add a comment

* `PUT    /projects/:projectId/comments/:id` — update a comment (re-analyzed)

* `DELETE /projects/:projectId/comments/:id` — remove a comment

* `POST   /projects/:projectId/import` — bulk import from text file

All `/projects/:projectId/*` routes require header `X-Project-Password: your_password`.

---

## License

MIT License
