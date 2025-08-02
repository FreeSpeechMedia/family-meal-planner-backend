const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AIRTABLE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AIRTABLE_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
  'Content-Type': 'application/json',
};

// Helper to check Bearer token
function checkToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.GPT_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Add Recipe
app.post('/api/add-recipe', checkToken, async (req, res) => {
  try {
    const { name, photo, category, cookTime, prepTime, totalTime, ingredientsList, instructions, tags } = req.body;
    const result = await axios.post(
      `${AIRTABLE_URL}/Recipes`,
      {
        fields: {
          Name: name,
          Photo: photo,
          Category: category,
          'Cook Time': cookTime,
          'Prep Time': prepTime,
          'Total Time': totalTime,
          'Ingredients List': ingredientsList,
          Instructions: instructions,
          Tags: tags,
        },
      },
      { headers: AIRTABLE_HEADERS }
    );
    res.json({ success: true, airtableId: result.data.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add Meal Plan
app.post('/api/add-mealplan', checkToken, async (req, res) => {
  try {
    const { name, date, recipe, rating } = req.body;
    const result = await axios.post(
      `${AIRTABLE_URL}/Meal%20Plan`,
      {
        fields: {
          Name: name,
          Date: date,
          Recipe: [recipe], // needs to be an array of record IDs
          Ratings: rating,
        },
      },
      { headers: AIRTABLE_HEADERS }
    );
    res.json({ success: true, airtableId: result.data.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Fite Family Food Planner backend is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
