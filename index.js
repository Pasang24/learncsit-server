const express = require("express");
const cors = require("cors");
const mjAPI = require("mathjax-node");
const admin = require("./config/firebaseConfig");
require("dotenv").config();

// initialize express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// initialize mathjax
mjAPI.config({
  MathJax: {
    SVG: {
      font: "TeX",
    },
  },
});
mjAPI.start();

// function which converts latex to svg
async function convertLatexToSvg(latex, isInline = true) {
  try {
    const result = await mjAPI.typeset({
      math: latex,
      format: "TeX",
      svg: true,
    });
    let svg = result.svg;
    if (isInline) {
      // If SVG already has a style attribute, append to it
      if (svg.includes('style="')) {
        svg = svg.replace(
          'style="',
          'style="display: inline; vertical-align: middle; '
        );
      } else {
        // If no style attribute exists, add one
        svg = svg.replace(
          "<svg",
          '<svg style="display: inline; vertical-align: middle;"'
        );
      }
    }
    return svg;
  } catch (error) {
    console.error("Error converting LaTeX to SVG:", error);
    return null;
  }
}

async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

// this function extracts latex from input string and replaces it with svg
async function processString(input) {
  const patterns = [
    /\\\((.*?)\\\)/g, // Inline math mode \( ... \)
    /\\\[(.*?)\\\]/g, // Display math mode \[ ... \]
    /\$\$(.*?)\$\$/g, // Display math mode $$ ... $$
    /\$(.*?)\$/g, // Inline math mode $ ... $
  ];

  let result = input;

  try {
    for (const pattern of patterns) {
      result = await replaceAsync(result, pattern, async (match, latex) => {
        const svg = await convertLatexToSvg(latex, true);
        return svg || match;
      });
    }
    return result;
  } catch (error) {
    console.error("Error processing string:", error);
    return input;
  }
}

// API endpoint to convert LaTeX in HTML
app.post("/convert", async (req, res) => {
  try {
    const { subject, year } = req.body;
    console.log(subject, year);

    const db = admin.firestore();

    let query = db
      .collection("questions")
      .where("subjectId", "==", subject)
      .where("year", "==", year)
      .orderBy("qNum");

    let snapShot = await query.get();
    let questions = [];

    snapShot.forEach((doc) => {
      questions.push(doc.data());
    });

    for (let question of questions) {
      const convertedTitle = await processString(question.title);
      question.title = convertedTitle;
    }

    res.json({ questions });
  } catch (error) {
    console.error("Conversion error:", error);
    res.status(500).json({
      success: false,
      error: "Error processing the conversion",
    });
  }
});

app.get("/", (req, res) => {
  res.send("Hello World. Welcome to LearnCSIT server.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
