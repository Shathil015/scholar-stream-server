const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

//middle wire
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@newproject10.iqzban8.mongodb.net/?appName=Newproject10`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("scholar_stream_db");
    const scholarshipsCollections = db.collection("scholarship");

    //scholarship api
    app.get("/allScholarship", async (req, res) => {});

    app.post("/allScholarship", async (req, res) => {
      const scholarship = req.body;
      const result = await scholarshipsCollections.insertOne(scholarship);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //     await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to scholar stream");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
