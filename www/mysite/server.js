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

// Pages
app.get("/home", (req, res) => {
  res.sendFile("home.html", { root: "public" });
});

app.get("/radio", (req, res) => {
  res.sendFile("radio.html", { root: "public" });
});

app.get("/about", (req, res) => {
  res.sendFile("about.html", { root: "public" });
});

app.get("/homepage", (req, res) => {
  res.sendFile("homepage.html", { root: "public" });
});

app.get("/homepage01", (req, res) => {
  res.sendFile("homepage01.html", { root: "public" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
