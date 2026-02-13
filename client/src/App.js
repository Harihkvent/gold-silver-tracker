// src/App.js
import React, { useEffect, useState } from "react";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE || "";

function App() {
  const [currency, setCurrency] = useState("INR");
  const [unit, setUnit] = useState("gram"); // gram | ounce | kg
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchRates = async (curr = currency) => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(
        `${API_BASE}/api/rates?currency=${curr.toLowerCase()}`
      );
      if (!res.ok) {
        // Try to read JSON error returned from server for clearer message
        let errText = `Request failed: ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody && errBody.error) errText = errBody.error + (errBody.details ? ` - ${errBody.details}` : "");
        } catch (e) {
          // not JSON, try text
          try {
            const t = await res.text();
            if (t) errText = t;
          } catch (ignore) {}
        }
        throw new Error(errText);
      }
      const data = await res.json();
      setRates(data);
    } catch (e) {
      console.error(e);
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates(currency);
    const id = setInterval(() => fetchRates(currency), 60000); // refresh every 60s
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const formatPrice = (value) => {
    if (value == null) return "-";
    const digits = currency === "INR" ? 2 : 2;
    return value.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  };

  const getDisplayPrices = (metal) => {
    if (!rates) return { main: "-", tenGram: "-" };
    let perUnit;
    if (unit === "gram") perUnit = metal.perGram;
    else if (unit === "ounce") perUnit = metal.perOunce;
    else perUnit = metal.perKg;

    const tenGramPrice = metal.perGram * 10;

    return {
      main: formatPrice(perUnit),
      tenGram: formatPrice(tenGramPrice),
    };
  };

  const goldDisplay = rates ? getDisplayPrices(rates.gold) : null;
  const silverDisplay = rates ? getDisplayPrices(rates.silver) : null;

  const unitLabel = {
    gram: "per gram",
    ounce: "per troy ounce",
    kg: "per kilogram",
  }[unit];

  const currencySymbol = currency === "INR" ? "₹" : "$";

  return (
    <div className="app">
      <header className="header">
        <h1>Gold & Silver Live Tracker</h1>
        <p className="subtitle">
          Real-time bullion prices with unit & currency conversion
        </p>
      </header>

      <section className="controls">
        <div className="control-group">
          <label>Currency</label>
          <div className="button-group">
            <button
              className={currency === "INR" ? "btn active" : "btn"}
              onClick={() => setCurrency("INR")}
            >
              INR (₹)
            </button>
            <button
              className={currency === "USD" ? "btn active" : "btn"}
              onClick={() => setCurrency("USD")}
            >
              USD ($)
            </button>
          </div>
        </div>

        <div className="control-group">
          <label>Unit</label>
          <div className="button-group">
            <button
              className={unit === "gram" ? "btn active" : "btn"}
              onClick={() => setUnit("gram")}
            >
              Gram
            </button>
            <button
              className={unit === "ounce" ? "btn active" : "btn"}
              onClick={() => setUnit("ounce")}
            >
              Ounce
            </button>
            <button
              className={unit === "kg" ? "btn active" : "btn"}
              onClick={() => setUnit("kg")}
            >
              Kg
            </button>
          </div>
        </div>

        <button className="btn refresh" onClick={() => fetchRates(currency)}>
          ↻ Refresh now
        </button>
      </section>

      {loading && <div className="status">Loading live prices…</div>}
      {error && <div className="status error">{error}</div>}

      {rates && (
        <main className="cards">
          <div className="card gold">
            <h2>Gold (XAU)</h2>
            <p className="price">
              <span className="symbol">{currencySymbol}</span>
              <span className="value">{goldDisplay.main}</span>
              <span className="unit">{unitLabel}</span>
            </p>
            <p className="subprice">
              {currencySymbol}
              {goldDisplay.tenGram} per 10 grams
            </p>
          </div>

          <div className="card silver">
            <h2>Silver (XAG)</h2>
            <p className="price">
              <span className="symbol">{currencySymbol}</span>
              <span className="value">{silverDisplay.main}</span>
              <span className="unit">{unitLabel}</span>
            </p>
            <p className="subprice">
              {currencySymbol}
              {silverDisplay.tenGram} per 10 grams
            </p>
          </div>
        </main>
      )}

      <footer className="footer">
        <p>
          Data source:{" "}
          <a
            href="https://goldpricez.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            GoldPriceZ.com
          </a>{" "}
          (live gold & silver price API)
        </p>
        {rates?.meta?.updated && (
          <p className="updated">
            Last updated (provider time): {rates.meta.updated}
          </p>
        )}
        <p className="disclaimer">
          Prices are for information only and do not constitute financial
          advice or purchase.
        </p>
      </footer>
    </div>
  );
}

export default App;
