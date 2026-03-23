const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function calculateDepreciation(purchasePrice, purchaseDate, method = 'straight_line', usefulLifeYears = 5, salvageValue = 0) {
  const today = new Date();
  const purchase = new Date(purchaseDate);
  const ageYears = (today - purchase) / (1000 * 60 * 60 * 24 * 365.25);
  const ageMonths = (today - purchase) / (1000 * 60 * 60 * 24 * 30.44);
  const depreciableAmount = purchasePrice - salvageValue;
  let currentValue, annualDepreciation, totalDepreciated;

  switch (method) {
    case 'double_declining': {
      const depRate = 2 / usefulLifeYears;
      currentValue = Math.max(purchasePrice * Math.pow(1 - depRate, ageYears), salvageValue);
      totalDepreciated = purchasePrice - currentValue;
      annualDepreciation = purchasePrice * depRate;
      break;
    }
    case 'sum_of_years': {
      const n = usefulLifeYears;
      const sumOfYears = (n * (n + 1)) / 2;
      let totalDep = 0;
      for (let y = 1; y <= Math.min(Math.floor(ageYears), n); y++) {
        totalDep += ((n - y + 1) / sumOfYears) * depreciableAmount;
      }
      const fracYear = ageYears - Math.floor(ageYears);
      if (Math.floor(ageYears) < n) {
        const nextYear = Math.floor(ageYears) + 1;
        totalDep += fracYear * ((n - nextYear + 1) / sumOfYears) * depreciableAmount;
      }
      totalDepreciated = Math.min(totalDep, depreciableAmount);
      currentValue = Math.max(purchasePrice - totalDepreciated, salvageValue);
      const curYear = Math.min(Math.ceil(ageYears), n);
      annualDepreciation = ((n - curYear + 1) / sumOfYears) * depreciableAmount;
      break;
    }
    default: {
      annualDepreciation = depreciableAmount / usefulLifeYears;
      totalDepreciated = Math.min(annualDepreciation * ageYears, depreciableAmount);
      currentValue = Math.max(purchasePrice - totalDepreciated, salvageValue);
    }
  }

  const percentDepreciated = (totalDepreciated / purchasePrice) * 100;
  const remainingLifeYears = Math.max(0, usefulLifeYears - ageYears);
  const fullyDepreciatedDate = new Date(purchase.getTime() + usefulLifeYears * 365.25 * 24 * 3600 * 1000);
  return {
    purchase_price: purchasePrice,
    current_value: Math.round(currentValue),
    total_depreciated: Math.round(totalDepreciated),
    annual_depreciation: Math.round(annualDepreciation),
    monthly_depreciation: Math.round(annualDepreciation / 12),
    percent_depreciated: parseFloat(percentDepreciated.toFixed(1)),
    age_years: parseFloat(ageYears.toFixed(2)),
    age_months: Math.round(ageMonths),
    remaining_life_years: parseFloat(remainingLifeYears.toFixed(2)),
    useful_life_years: usefulLifeYears, salvage_value: salvageValue, method,
    fully_depreciated_date: fullyDepreciatedDate.toISOString().split('T')[0],
    is_fully_depreciated: ageYears >= usefulLifeYears,
  };
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const equipment = db.prepare(`
      SELECT id, asset_tag, category, brand, model, purchase_price, purchase_date, status
      FROM equipment WHERE is_active=1 AND purchase_price IS NOT NULL AND purchase_date IS NOT NULL
      ORDER BY purchase_price DESC
    `).all();

    const method = req.query.method || 'straight_line';
    const usefulLife = parseInt(req.query.useful_life) || 5;
    const results = equipment.map(eq => ({ id: eq.id, asset_tag: eq.asset_tag, category: eq.category, brand: eq.brand, model: eq.model, status: eq.status, ...calculateDepreciation(eq.purchase_price, eq.purchase_date, method, usefulLife) }));

    const totalOriginal    = results.reduce((s, r) => s + r.purchase_price, 0);
    const totalCurrent     = results.reduce((s, r) => s + r.current_value, 0);
    const totalDepreciated = results.reduce((s, r) => s + r.total_depreciated, 0);

    res.json({ success: true, data: results, summary: { total_assets: results.length, total_original_value: totalOriginal, total_current_value: totalCurrent, total_depreciated: totalDepreciated, overall_percent_depreciated: parseFloat(((totalDepreciated / totalOriginal) * 100).toFixed(1)) } });
  } catch (err) {
    console.error('Depreciation error:', err);
    res.status(500).json({ success: false, message: 'Failed to calculate depreciation.' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const equipment = db.prepare(`SELECT id, purchase_price, purchase_date FROM equipment WHERE is_active=1 AND purchase_price IS NOT NULL AND purchase_date IS NOT NULL`).all();
    const results = equipment.map(eq => calculateDepreciation(eq.purchase_price, eq.purchase_date));
    const totalOriginal = results.reduce((s, r) => s + r.purchase_price, 0);
    const totalCurrent  = results.reduce((s, r) => s + r.current_value, 0);
    res.json({ success: true, data: { total_original: totalOriginal, total_current: totalCurrent, total_depreciated: totalOriginal - totalCurrent } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get depreciation stats.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const eq = db.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!eq) return res.status(404).json({ success: false, message: 'Equipment not found.' });
    if (!eq.purchase_price || !eq.purchase_date) return res.status(400).json({ success: false, message: 'Purchase price and date required.' });

    const method = req.query.method || 'straight_line';
    const usefulLife = parseInt(req.query.useful_life) || 5;
    const salvage = parseFloat(req.query.salvage) || 0;
    const schedule = [];
    for (let y = 1; y <= usefulLife; y++) {
      const futureDate = new Date(eq.purchase_date);
      futureDate.setFullYear(futureDate.getFullYear() + y);
      const calc = calculateDepreciation(eq.purchase_price, eq.purchase_date, method, usefulLife, salvage);
      const yearEndCalc = calculateDepreciation(eq.purchase_price, futureDate.toISOString(), method, usefulLife, salvage);
      schedule.push({ year: y, year_end: futureDate.toISOString().split('T')[0], depreciation: calc.annual_depreciation, book_value: yearEndCalc.current_value });
    }
    res.json({ success: true, data: { equipment: { id: eq.id, asset_tag: eq.asset_tag, brand: eq.brand, model: eq.model }, depreciation: calculateDepreciation(eq.purchase_price, eq.purchase_date, method, usefulLife, salvage), schedule } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get depreciation detail.' });
  }
});

router.post('/calculate', (req, res) => {
  try {
    const { purchase_price, purchase_date, method, useful_life_years, salvage_value } = req.body;
    if (!purchase_price || !purchase_date) return res.status(400).json({ success: false, message: 'purchase_price and purchase_date required.' });
    const result = calculateDepreciation(parseFloat(purchase_price), purchase_date, method || 'straight_line', parseInt(useful_life_years) || 5, parseFloat(salvage_value) || 0);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Calculation failed.' });
  }
});

module.exports = router;
