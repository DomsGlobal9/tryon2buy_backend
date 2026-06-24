# Tryon2Buy External Microservice API Documentation

This document serves as the single source of truth for integrating with the Tryon2Buy External Microservice API. It covers all available endpoints, payload requirements, authentication, and comprehensive reference lists for categories, backgrounds, and modifications, strictly parsed from the backend source code.

## Base URLs
Depending on your environment, prepend the following Base URL to all API endpoints:
- **Local Development:** `http://localhost:4000`
- **Production (Render):** `https://tryon2buy-backend-dev.onrender.com` *(or your final live URL)*

> [!IMPORTANT]
> **Synchronous Processing:** All endpoints in this microservice run synchronously. The connection will remain open while the AI generates the image (typically 10-25 seconds). Ensure your HTTP client's timeout is set to at least 60 seconds.

## Image Requirements
For the best AI generation results and to avoid server errors, ensure all images passed to the API meet these criteria:
- **Format:** JPEG, PNG, or WebP.
- **Accessibility:** Must be a publicly accessible URL (no authentication required to download).
- **Resolution:** Recommended minimum 512x512px. Very large images will be automatically compressed by the pipeline.

---

## Authentication

All external API endpoints require API Key authentication via a custom header. 

**Header Name:** `x-api-key`  
**Value:** The key defined in your backend environment variables (e.g., `tryon2buy-ext-api-key-2026`)

If the header is missing or incorrect, the server will return a `401 Unauthorized` response:
```json
{ "error": "Unauthorized — invalid or missing x-api-key header." }
```

---

## 1. Virtual Try-On
Processes an AI-driven virtual try-on mapping a garment onto a human model.

- **Endpoint:** `POST /api/external/tryon`
- **Content-Type:** `application/json`

### Request Payload
| Field | Type | Required | Description |
|---|---|---|---|
| `garmentImageUrl` | String (URL) | **Yes** | Publicly accessible URL of the garment to be tried on. |
| `humanImageUrl` | String (URL) | **Yes** | Publicly accessible URL of the person/model. |
| `category` | String | No | Specialized processing category. If omitted or invalid, falls back to `DEFAULT`. |

### Valid Categories
The system applies specialized structural logic based on these exact string values:
- `SAREE`
- `LEHANGA` 
- `ANARKALI`
- `SHARARA`
- `KURTHI`
- `DEFAULT` *(Standard outfit fallback)*

### Success Response (200 OK)
```json
{
  "success": true,
  "resultImageUrl": "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/results/abc-123.jpg",
  "processingTimeMs": 18450,
  "is_mock": false
}
```

### Example Usage (cURL)
```bash
curl -X POST https://tryon2buy-backend-dev.onrender.com/api/external/tryon \
  -H "x-api-key: tryon2buy-ext-api-key-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "garmentImageUrl": "https://example.com/dress.jpg",
    "humanImageUrl": "https://example.com/model.jpg",
    "category": "LEHANGA"
  }'
```

---

## 2. Change Background
Composites a generated image or existing model into a high-quality studio/location background.

- **Endpoint:** `POST /api/external/change-background`
- **Content-Type:** `application/json`

### Request Payload
| Field | Type | Required | Description |
|---|---|---|---|
| `imageUrl` | String (URL) | **Yes** | Publicly accessible URL of the person/model to be placed in the background. |
| `backgroundId` | String | **Yes** | The specific ID of the target background. |

### Valid Background IDs
You must pass one of the following exact string IDs:
- `bg1` *(Ancient Temple)*
- `bg2` *(Festive Palace)*
- `bg3` *(Luxury Boutique)*
- `bg4` *(Hotel Lobby)*
- `bg5` *(Floral Archway)*
- `bg6` *(Golden Palace)*
- `bg7` *(Tropical Garden)*
- `bg8` *(Beach Resort)*

### Success Response (200 OK)
```json
{
  "success": true,
  "resultImageUrl": "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/results/def-456.jpg",
  "processingTimeMs": 12200
}
```

---

## 3. Modify Outfit (Sleeves & Necklines)
Uses AI to alter specific structural components of an outfit (e.g., sleeve length, neckline style).

- **Endpoint:** `POST /api/external/modify-outfit`
- **Content-Type:** `application/json`

### Request Payload
| Field | Type | Required | Description |
|---|---|---|---|
| `imageUrl` | String (URL) | **Yes** | Publicly accessible URL of the image containing the outfit to modify. |
| `modificationType` | String | **Yes** | The specific ID of the modification requested. |

### Valid Modification Types
You must pass one of the following exact string IDs. The system supports both blouse/sleeve modifications and neck modifications via the same endpoint.

**Sleeve Modifications:**
- `elbow-sleeve` *(Redesigns to Half Sleeve)*
- `full-sleeve` *(Redesigns to Full Sleeve down to wrist)*
- `sleeveless` *(Removes sleeve fabric entirely)*

**Neckline Modifications:**
- `boat-neck` *(Boat Neck style)*
- `round-neck` *(Classic Round Neck style)*
- `collar-neck` *(High Round Neck / Mandarin Collar)*

### Success Response (200 OK)
```json
{
  "success": true,
  "resultImageUrl": "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/results/ghi-789.jpg",
  "processingTimeMs": 14100
}
```

---

## Error Handling
For all endpoints, if a server error, AI pipeline failure, or validation error occurs, the API will return a non-200 status code (typically `400 Bad Request` or `500 Internal Server Error`) with the following JSON structure:

```json
{
  "error": "Error message detailing what went wrong (e.g., 'Missing required fields', 'Unknown backgroundId: bg99')"
}
```
