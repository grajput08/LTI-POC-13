const express = require("express");
const router = express.Router();

// GET / route
router.get("/", (req, res) => {
  console.log("Received request on root route");
  res.json({
    message: "Welcome to the API",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
