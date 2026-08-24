const express = require("express");

const app = express();
const PORT = 3001;

app.use(express.static("public"));

app.get("/api/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Node.js работает!"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
