const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

const stripe = require("stripe")(process.env.STRIP_SECRET);

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
    const paymentsCollection = db.collection("payments");
    // const applicationsCollections = db.collection("applications");

    //scholarship api
    app.get("/allScholarship", async (req, res) => {
      const search = req.query.search || "";

      const subjectCategory = req.query.subjectCategory || "";

      let query = {};

      const { email } = req.query;
      if (email) {
        query.userEmail = email;
      }

      // Search functionality
      if (search) {
        query.$or = [
          { scholarshipName: { $regex: search, $options: "i" } },
          { universityName: { $regex: search, $options: "i" } },
          { degree: { $regex: search, $options: "i" } },
        ];
      }

      // Filter by subject category
      if (subjectCategory) {
        query.subjectCategory = subjectCategory;
      }

      const result = await scholarshipsCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/allScholarship", async (req, res) => {
      const query = {};

      const { email } = req.query;
      if (email) {
        query.userEmail = email;
      }

      const options = {
        sort: { applicationDeadline: 1 },
      };

      const cursor = scholarshipsCollections.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/allScholarship/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipsCollections.findOne(query);
      res.send(result);
    });

    //new payment with details

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;

      const amount = parseInt(paymentInfo.cost) * 100;

      // 1. Create Stripe Session
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.senderEmail,
        metadata: {
          parcelId: paymentInfo.parcelId,
        },
        success_url: `${process.env.SITE_DOMAIN}/all-scholarships/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/all-scholarships/payment-cancelled`,
      });

      // 2. SAVE PAYMENT AS PENDING
      await paymentsCollection.insertOne({
        sessionId: session.id,
        parcelId: paymentInfo.parcelId,
        userEmail: paymentInfo.senderEmail,
        universityName: paymentInfo.parcelName,
        amount: paymentInfo.cost,
        currency: "USD",
        status: "pending",
        createdAt: new Date(),
      });

      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;

      if (!sessionId) {
        return res.status(400).send({ message: "Session ID missing" });
      }

      // 1. Retrieve session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).send({ message: "Payment not completed" });
      }

      // 2. Update DB
      const result = await paymentsCollection.updateOne(
        { sessionId },
        {
          $set: {
            status: "paid",
            paymentIntentId: session.payment_intent,
            paidAt: new Date(),
          },
        }
      );

      res.send({ success: true });
    });

    // app.post("/allScholarship", async (req, res) => {
    //   const scholarship = req.body;
    //   const result = await scholarshipsCollections.insertOne(scholarship);
    //   res.send(result);
    // });

    // //applications api
    // app.post("/applications", async (req, res) => {
    //   const application = req.body;
    //   const result = await applicationsCollections.insertOne(application);
    //   res.send(result);
    // });

    // app.get("/applications/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await applicationsCollections.findOne(query);
    //   res.send(result);
    // });

    // app.delete("/applications/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await applicationsCollections.deleteOne(query);
    //   res.send(result);
    // });

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
