const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

const crypto = require("crypto");

function generateTransactionId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TXN-${date}-${random}`;
}

const stripe = require("stripe")(process.env.STRIP_SECRET);
function generateTrackingId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TRK-${date}-${random}`;
}

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
    const usersCollection = db.collection("users");
    const scholarshipsCollections = db.collection("scholarship");
    const applicationsCollection = db.collection("applications");
    const reviewsCollection = db.collection("reviews");
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
      const trackingId = generateTrackingId();
      const transactionId = generateTransactionId();

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.scholarshipName,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        customer_email: paymentInfo.userEmail,
        metadata: {
          scholarshipId: paymentInfo.parcelId,
          trackingId,
          transactionId,
        },
        success_url: `${process.env.SITE_DOMAIN}/all-scholarships/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/all-scholarships/payment-cancelled`,
      });

      // SAVE TO paymentsCollection (NOT applications)
      await paymentsCollection.insertOne({
        transactionId,
        trackingId,
        sessionId: session.id,
        scholarshipId: paymentInfo.scholarshipId,
        userEmail: paymentInfo.userEmail,
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

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).send({ message: "Payment not completed" });
      }

      const { transactionId, trackingId } = session.metadata;

      // Update ONLY if pending
      await paymentsCollection.updateOne(
        { sessionId, status: "pending" },
        {
          $set: {
            status: "paid",
            paymentIntentId: session.payment_intent,
            paidAt: new Date(),
          },
        }
      );

      res.send({
        success: true,
        transactionId,
        trackingId,
      });
    });

    app.get("/payment-checkout-session", async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/payment-selection/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };

      // Prevent deleting paid applications
      const payment = await applicationsCollection.findOne(query);

      if (!payment) {
        return res.status(404).send({ message: "Selection not found" });
      }

      if (payment.status === "paid") {
        return res
          .status(403)
          .send({ message: "Paid applications cannot be deleted" });
      }

      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/payment-info/:sessionId", async (req, res) => {
      const payment = await paymentsCollection.findOne({
        sessionId: req.params.sessionId,
      });

      if (!payment) {
        return res.status(404).send({ message: "Payment not found" });
      }

      res.send(payment);
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
