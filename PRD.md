**Goal:** Prove that an AI agent can *learn* a coordinator’s workflow from email and autonomously handle new coordination tasks end-to-end, producing human-quality drafts.

### **Objectives**

Build a working system that:

1. Learns workflow patterns, required information, and communication style from historical email.
2. Detects a new inquiry.
3. Extracts structured information using the learned schema.
4. Coordinates multiple parties (via connected calendars).
5. Generates a believable draft message matching the user’s tone.

If the demo runs this loop without manual scripting, it proves agentic coordination is viable.

---

### **2. Core Components**

### **2.1 Email Learning Pipeline**

**Purpose:** Construct a minimal knowledge graph of how one coordinator works.

**Functions**

- OAuth or dummy CSV ingest of ~400 sent emails.
    - We can use an LLM to generate a realistic set given a persona from a list - so demo can be repeated with significant variance! (e.g. Studio manager, Events coordinator, Construction service manager)
- Fetch each thread’s context (client messages).
    - We’d need to exclude unrelated or unknown message types / anomalees - this might be hard!
- Clean text (strip quotes, signatures) & filter noise (see below)
- Extract:
    - Stages (3 + distinct coordination stages)
    - Required fields (≥ 5 unique data points repeatedly requested)
    - Frequent collaborators (≥ 3 with inferred roles)
    - Recurring questions & phrases (greetings, closings, transitions)
- Generate embeddings for semantic retrieval.

**Noise Filtering**

- Classify message type using lightweight LLM call: booking-related, receipt, marketing, personal, notification
- Skip if classified as non-booking with confidence ≥0.9
- Skip messages <300 characters after cleaning (likely fragments)
- Skip threads with <2 back-and-forth exchanges (not real coordination)
- Goal: Final training set contains <5% noise

**Acceptance**

- ≥ 95 % messages parsed cleanly.
- Workflow stages, fields, and collaborators discovered.
- Output JSON knowledge graph.
- Cost < $5 per user, runtime < 5 min.

**Failure Handling**

- If < 3 fields or stages found → fallback schema `{date, time, contact, description}`; flag “fallback mode”.

---

### **2.2 Session Clustering**

**Purpose:** Group related threads into one coordination “session”.

**Signals:** thread ID > subject similarity > participant overlap > time proximity > embedding similarity.

**Stage Inference:** map to learned workflow stages, not hard-coded labels.

**Acceptance:** ≥ 80 % correct grouping, < 10 % false positives, stage accuracy ≥ 70 %.

---

### **2.3 Classification & Extraction**

**Purpose:** Detect new coordination emails and extract structured fields per learned schema.

**Pipeline**

1. Classify as inquiry / follow-up / confirmation using GPT-5-mini or similar (your choice).
2. Extract dynamic fields from user-specific schema.
3. Identify missing required fields.
4. Determine which parties must be involved from coordination network.

**Routing**

- ≥ 0.85 confidence → auto-process
- 0.60–0.84 → manual review
- < 0.60 → needs review bucket

**Acceptance:** precision ≥ 90 %, recall ≥ 80 %, F1 ≥ 0.85.

---

### **2.4 Calendar Integration (Real)**

**Purpose:** Demonstrate scheduling logic by integrating calendars

**Mode**

- Returns deterministic availability for demo dates.

---

### **2.5 Orchestration Engine**

**Purpose:** Execute learned coordination process.

**Flow**

1. From extracted entities → generate coordination plan (calendar + 2 contractors + client clarification).
2. Execute checks in parallel; simulate delays (5–15 s).
    1. We can maybe spin up small agents to act like a supplier/freelancer/whatever party they communicate to externally (just so demo has some variance!) - see Contractor reponse simulation below.
3. Mark status: pending / confirmed / failed.
4. Wait for all **critical** checks to finish:
    - calendar availability,
    - any field marked “always required”,
    - required party in learned network.
5. Compile results into coordination summary.

**Contractor Response Simulation**

For demo variance, simulate contractor responses using:

**Option A: Simple delays + random outcomes**

- Each contractor has 80% acceptance rate
- Response delay: 5-15 seconds (randomized)
- Response text generated from template

**Option B: Small agent actors (advanced)**

- Separate LLM agent per contractor persona
- Receives coordination request
- Checks mock availability/interest
- Responds in character with slight variation
- Adds realism but increases complexity

Choose Option A for MVP unless Option B is trivial to implement.

**Acceptance**

- Plan reflects learned schema (not hard-coded).
- Parallel checks execute without crash.
- Status endpoint shows live progress.
- A “Session Status” view should update live as each simulated contractor responds, showing real-time progress.
- Flow completes within 30s (for demo purposes! as we’ve simulated communications)

---

### **2.6 Draft Generation**

**Purpose:** Prove system can reproduce operator-quality tone.

**Process**

1. Retrieve 3–5 most similar past responses (embedding search).
2. Insert them as few-shot examples in prompt:
    
    *“Draft a response in this user’s style confirming the coordination results below.”*
    
3. Model (GPT-4o) produces draft.
4. Display with **Approve / Edit / Reject**.

**Tone Learning**

- No abstract tone attributes.
- Style learned directly from examples: greetings, closings, sentence rhythm, punctuation, phrase reuse.

**Acceptance**

- Draft includes confirmed data.
- Tone judged “sounds like me” by user in ≥ 60 % of demos.
- Draft generation < 3 s latency.

---

### **3. Data Model (Simplified)**

- **User:** id, email, tokens, learning status
- **Message:** id, thread id, body plain, sent_at
- **Session:** id, participants[], stage, message_ids[]
- **Knowledge Graph:** workflow, schema, network, phrases
- **Coordination Plan:** session id, checks[], status
- **Draft:** body, created_at, status
- **Embeddings:** message_id, vector[1536]

---

### **4. Test Data Requirements**

Two labelled datasets (≈ 100 emails total):

**Studio Booking (50)** and **Event Venue (50)**

Each includes:

```json
{
  "raw_email": "string",
  "is_booking": true,
  "stage": "clarifying",
  "entities": {"date":"2025-12-07","guests":50,"budget":"5000"},
  "ground_truth": {...}
}

```

Used to measure precision/recall/F1 for classification + extraction.

---

### **5. Success Metrics**

| Area | Target |
| --- | --- |
| Learning Pipeline | ≥ 3 workflow stages + 5 required fields identified |
| Classification | F1 ≥ 0.85 |
| Orchestration | Full run < 30 s simulated time |
| Draft Quality | ≥ 60 % “sounds authentic” rating |
| System Reliability | > 95 % success across 5 runs |

---

### **6. Privacy & Security (can delay for demo)**

- Encrypt all tokens (Gmail, Calendar).
- Provide `/delete-user-data` endpoint.
- Delete all messages on request.
- Store only minimal metadata for metrics.

---

### **7. Known Limitations**

- Email channel only
- No continuous learning from edits
- Polling for status (2 s interval)
- Single-user mode
- Manual draft approval - unless we come up with a way to score confidence where it’s VERY high and should auto-approve.

All acceptable for MVP.

---

### **8. Deliverables**

Working backend + minimal API

JSON knowledge graph output

Embeddings stored in pgvector

Classification + Extraction results on test data

End-to-end coordination demo front-end

---