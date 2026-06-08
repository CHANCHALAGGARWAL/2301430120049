export {};
const express = require("express");
const cors = require("cors");
const notificationRoutes = require("./routes/notifications");
const { Log } = require("../../logging_middleware/index");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/notifications", notificationRoutes);

const PORT = 5000;
app.listen(PORT, async () => {
  await Log("backend", "info", "service", `Server started on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;