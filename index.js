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
function toLocalOffsetIsoMidnight(dateLike) {
  // Expect "YYYY-MM-DD" ideally; otherwise parse and use that day in local server TZ
  const base = new Date(dateLike);
  if (isNaN(base)) throw new Error("Invalid date; use YYYY-MM-DD or ISO 8601");

  // Construct midnight *local* (server local). If your server isn't in Chicago,
  // prefer sending "YYYY-MM-DDT00:00:00-05:00" from the GPT instead.
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);

  const offMin = local.getTimezoneOffset();  // minutes difference to UTC (e.g., 300 in CDT)
  const sign = offMin <= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");

  const yyyy = local.getFullYear();
  const MM = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");

  return `${yyyy}-${MM}-${dd}T00:00:00${sign}${hh}:${mm}`;
}
// Add Meal Plan (hardened)
app.post('/api/add-mealplan', checkToken, async (req, res) => {
  try {
    const { name, date, recipe } = req.body;
    if (!name || !date || !recipe) {
      return res.status(400).json({ error: "Missing required fields: name, date, recipe" });
    }

    // Strict ISO 8601 datetime
     let isoDateTime;
    try {
      isoDateTime = toLocalOffsetIsoMidnight(date);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Linked Recipe(s)
    const recipeIds = Array.isArray(recipe) ? recipe : [recipe];
    const recipeLinks = recipeIds.map(id => ({ id: String(id) }));

    const fields = {
      Name: name,
      Date: isoDateTime,
      fldDiP26FnhcK3Sfw: recipeLinks
    };

    const payload = { records: [{ fields }], typecast: true };

    const url = `${AIRTABLE_URL}/Meal%20Plan`; // ideally use table ID
    const r = await axios.post(url, payload, { headers: AIRTABLE_HEADERS });

    const recs = r?.data?.records;
    if (!Array.isArray(recs) || !recs.length) {
      return res.status(502).json({ error: "Airtable returned no records", raw: r.data });
    }
    // After create:
const createdId = r.data.records[0].id;

// Verify the link landed
const verify = await axios.get(`${AIRTABLE_URL}/Meal%20Plan/${createdId}?returnFieldsByFieldId=true`,
                               { headers: AIRTABLE_HEADERS });
const linked = verify.data.fields?.fldRECIPE || [];
if (!linked.length) {
  return res.status(502).json({
    error: "LinkMissing",
    message: "Recipe link did not attach",
    createdId,
    airtable: verify.data
  });
}

return res.status(201).json({ created: true, id: createdId });


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
