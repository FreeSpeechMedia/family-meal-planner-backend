const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
// 1) Simple health endpoint (no auth)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

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
      tags,
      notes = ''
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
    if (notes) fields.Notes = notes;
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

// Add Meal Plan (hardened)
app.post('/api/add-mealplan', checkToken, async (req, res) => {
  try {
    const { name, date, recipe } = req.body;
    if (!name || !date || !recipe) {
      return res.status(400).json({ error: "Missing required fields: name, date, recipe" });
    }

    // Date (robust)
    let iso;
    try { iso = toIsoDate(date); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    // Linked Recipe(s)
    const recipeIds  = Array.isArray(recipe) ? recipe : [recipe];
    const recipeLinks = recipeIds.map(id => ({ id: String(id) }));

    const fields = {
      // Prefer field IDs if you have them
      Name: name,
      Date: iso,
      Recipe: recipeLinks
    };

    const payload = { records: [{ fields }], typecast: true };

    // Prefer table ID (tbl...) instead of name for resilience
    const url = `${AIRTABLE_URL}/Meal%20Plan`;
    const r = await axios.post(url, payload, { headers: AIRTABLE_HEADERS });

    const recs = r?.data?.records;
    if (!Array.isArray(recs) || !recs.length) {
      return res.status(502).json({ error: "Airtable returned no records", raw: r.data });
    }
    return res.status(201).json({ created: true, records: recs.map(x => ({ id: x.id })) });

  } catch (err) {
    const status = err?.response?.status || 500;
    return res.status(status).json({
      error: 'airtable',
      status,
      detail: err?.response?.data || err.message
    });
  }
});


app.get('/api/recipes-min', checkToken, async (req, res) => {
  try {
    const result = await axios.get(
      `${AIRTABLE_URL}/Recipes?maxRecords=20&fields[]=Name`,
      { headers: AIRTABLE_HEADERS }
    );
    // Return only record ID and Name (or just ID)
    const records = result.data.records.map(rec => ({
      id: rec.id,
      name: rec.fields.Name
    }));
    res.json(records);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get('/api/recipes/:id', checkToken, async (req, res) => {
  try {
    const result = await axios.get(
      `${AIRTABLE_URL}/Recipes/${req.params.id}`,
      { headers: AIRTABLE_HEADERS }
    );
    res.json(result.data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/mealplans', checkToken, async (req, res) => {
  try {
    const result = await axios.get(
      `${AIRTABLE_URL}/Meal%20Plan?maxRecords=100`,
      { headers: AIRTABLE_HEADERS }
    );
    res.json(result.data.records);
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
