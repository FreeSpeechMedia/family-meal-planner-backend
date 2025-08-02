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
    const {
      name,
      photo,
      category,
      prepTime,
      cookTime,
      totalTime,
      ingredientsList,
      instructions,
      tags
    } = req.body;

    // Handle photo field for Airtable attachment
    let photoArray = [];
    if (photo && typeof photo === "string" && photo.startsWith("http")) {
      photoArray = [{ url: photo }];
    }

    // Join arrays into newlines for text fields
    const ingredientsText = Array.isArray(ingredientsList)
      ? ingredientsList.join('\n')
      : ingredientsList || '';

    const instructionsText = Array.isArray(instructions)
      ? instructions.join('\n')
      : instructions || '';

    // Only send fields with values
    const fields = {
      Name: name,
      Category: category,
      "Prep Time": prepTime,
      "Cook Time": cookTime,
      "Total Time": totalTime,
      "Ingredient List": ingredientsText,
      Instructions: instructionsText,
    };

    if (photoArray.length > 0) fields.Photo = photoArray;
    if (Array.isArray(tags) && tags.length > 0) fields.Tags = tags;

    const result = await axios.post(
      `${AIRTABLE_URL}/Recipes`,
      { fields },
      { headers: AIRTABLE_HEADERS }
    );
    res.json({ success: true, airtableId: result.data.id });
  } catch (err) {
    // Pass through Airtable's error for easier debugging
    if (err.response && err.response.data) {
      res.status(400).json({ error: err.response.data });
    } else {
      res.status(400).json({ error: err.message });
    }
  }
});
app.get('/api/recipes-sample', checkToken, async (req, res) => {
  try {
    const result = await axios.get(
      `${AIRTABLE_URL}/Recipes?maxRecords=1`,
      { headers: AIRTABLE_HEADERS }
    );
    res.json(result.data.records[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add Meal Plan
app.post('/api/add-mealplan', checkToken, async (req, res) => {
  try {
    const { name, date, meal, recipe, rating } = req.body;

    // Build the fields object
    const fields = {
      Name: name,
      Date: date,
      Recipe: [recipe], // needs to be an array of record IDs
    };
    if (rating) fields.Ratings = rating;
    if (meal) fields.Meal = meal; // <-- single string, e.g. "Dinner"

    const result = await axios.post(
      `${AIRTABLE_URL}/Meal%20Plan`,
      { fields },
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
