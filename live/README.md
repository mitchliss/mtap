# live/ - near-live data the site reads at runtime

Files here are fetched by players' browsers straight from GitHub
(`https://raw.githubusercontent.com/mitchliss/mtap/main/live/<file>`), not built into
the site, so updating them does NOT redeploy Pages (`deploy.yml` ignores `live/**` on
push). A scheduled news routine rewrites `headlines.json` every few hours.

## headlines.json - news pins on the globe

```json
{
  "updated": "2026-11-25T21:00:00Z",
  "pins": [
    {
      "id": "natanz-2026-11-25a",
      "lat": 33.72,
      "lng": 51.73,
      "place": "Natanz, Iran",
      "title": "Short headline in plain words",
      "summary": "One or two sentences of context.",
      "kind": "military",
      "time": "2026-11-25T18:00:00Z",
      "source": "https://www.example.com/the-article"
    }
  ]
}
```

| field | rule (a pin that breaks any rule is dropped whole) |
|---|---|
| `id` | string, 1-40 chars, unique. Ids starting with `sample-` are never shown. |
| `lat`, `lng` | numbers, -90..90 and -180..180 (where the event happened) |
| `place` | string, 1-60 chars, e.g. `"Natanz, Iran"` - the card reads "near <place>" |
| `title` | string, 1-90 chars |
| `summary` | string, at most 220 chars (optional; not shown on the card yet) |
| `kind` | `military`, `conflict`, `disaster`, `politics`, `science` or `other` (military/conflict draw red-orange, disaster amber, the rest blue) |
| `time` | ISO 8601 UTC time of the event. Pins older than 72 h, or more than 1 h in the future, are dropped. |
| `source` | an `https://` URL; the card links it. Anything else drops the pin. |

At most 12 pins are drawn (the freshest). The client caches the file for 10 minutes
and adds `?t=<5-minute bucket>` to the URL. A missing file, a 404 or bad JSON shows
nothing and says nothing. Validation: `parseHeadlines` in `src/hazards.js`; tests in
`test/hazards.mjs`.

The answer card shows the freshest pin within 600 km of the answer:
"📰 3 h ago near Natanz, Iran: <title> <source host ↗>".
