const SERVICE_TYPES = {
  "Data Center Decommissioning": "data_center_decommissioning",
  "Lease Restoration": "lease_restoration",
  "Cable Abatement": "cable_abatement",
  "HVAC Removal": "hvac_removal",
  "Electrical Decommissioning": "electrical_decommissioning",
  "Asset Recovery": "asset_recovery"
};

const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "company",
    "contact",
    "site",
    "service",
    "timeline",
    "equipment",
    "commercial",
    "missingRequirements",
    "summary",
    "priority",
    "workload",
    "confidenceScore",
    "estimateRange",
    "nextBestActions",
    "followUpQuestions"
  ],
  properties: {
    company: {
      type: "object",
      additionalProperties: false,
      required: ["name", "website", "industry"],
      properties: {
        name: { type: "string" },
        website: { type: ["string", "null"] },
        industry: { type: ["string", "null"] }
      }
    },
    contact: {
      type: "object",
      additionalProperties: false,
      required: ["fullName", "email", "phone", "preferredChannel"],
      properties: {
        fullName: { type: "string" },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        preferredChannel: { type: "string", enum: ["email", "phone", "text", "unknown"] }
      }
    },
    site: {
      type: "object",
      additionalProperties: false,
      required: ["name", "fullAddress", "city", "region", "country", "siteType", "accessNotes"],
      properties: {
        name: { type: "string" },
        fullAddress: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        region: { type: ["string", "null"] },
        country: { type: "string" },
        siteType: { type: "string", enum: ["data_center", "office", "warehouse", "mixed", "unknown"] },
        accessNotes: { type: ["string", "null"] }
      }
    },
    service: {
      type: "object",
      additionalProperties: false,
      required: ["type", "label", "scopeBullets"],
      properties: {
        type: { type: "string", enum: Object.values(SERVICE_TYPES).concat("other") },
        label: { type: "string" },
        scopeBullets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 }
      }
    },
    timeline: {
      type: "object",
      additionalProperties: false,
      required: ["leaseEndDate", "requestedDueDate", "urgencyReason"],
      properties: {
        leaseEndDate: { type: ["string", "null"] },
        requestedDueDate: { type: ["string", "null"] },
        urgencyReason: { type: ["string", "null"] }
      }
    },
    equipment: {
      type: "object",
      additionalProperties: false,
      required: ["rackCount", "assets", "dataDestructionMentioned", "electricalDisconnectMentioned"],
      properties: {
        rackCount: { type: ["number", "null"] },
        assets: { type: "array", items: { type: "string" }, maxItems: 12 },
        dataDestructionMentioned: { type: "boolean" },
        electricalDisconnectMentioned: { type: "boolean" }
      }
    },
    commercial: {
      type: "object",
      additionalProperties: false,
      required: ["budgetMentioned", "decisionMakerKnown", "proposalRequested"],
      properties: {
        budgetMentioned: { type: "boolean" },
        decisionMakerKnown: { type: "boolean" },
        proposalRequested: { type: "boolean" }
      }
    },
    missingRequirements: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "category", "severity", "reason"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          category: { type: "string", enum: ["scope", "timeline", "access", "equipment", "commercial", "safety", "documentation"] },
          severity: { type: "string", enum: ["low", "medium", "high", "blocking"] },
          reason: { type: "string" }
        }
      }
    },
    summary: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    workload: { type: "string", enum: ["low", "medium", "high"] },
    confidenceScore: { type: "integer", minimum: 0, maximum: 100 },
    estimateRange: {
      type: "object",
      additionalProperties: false,
      required: ["lowCents", "highCents", "rationale"],
      properties: {
        lowCents: { type: ["integer", "null"] },
        highCents: { type: ["integer", "null"] },
        rationale: { type: "string" }
      }
    },
    nextBestActions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    followUpQuestions: { type: "array", items: { type: "string" }, maxItems: 10 }
  }
};

const INTAKE_DEVELOPER_PROMPT = `You are DC Decom's senior intake estimator. Convert customer emails, call notes, text messages, manual notes, and extracted document or photo text into complete, structured inquiry data.

CORE RULES
1. Extract only information stated or strongly supported by the source.
2. Never invent customer, site, equipment, timeline, access, budget, or pricing details.
3. Use null for unknown nullable values.
4. For required names, use "Unknown Company", "Unknown Contact", or "Customer Site" when unavailable.
5. Return dates as YYYY-MM-DD. Do not resolve ambiguous dates without sufficient context.
6. Monetary values must be integer cents.
7. A "mentioned" boolean records whether the topic appears in the source, not whether the requirement is satisfied.
8. Keep scope bullets concise, specific, and operational. Preserve useful details such as square footage, quantities, responsibilities, exclusions, and deliverables in those bullets.
9. If pricing evidence is insufficient, set both estimate values to null.
10. Follow the supplied JSON schema exactly and return no commentary outside it.

SERVICE CLASSIFICATION
Choose exactly one supported service type: data_center_decommissioning, lease_restoration, cable_abatement, hvac_removal, electrical_decommissioning, asset_recovery, or other.

EXTRACTION COVERAGE
- Company: name, website, and industry.
- Primary contact: full name, email, phone, and preferred channel.
- Site: facility name, exact full street address including unit or suite and postal code when stated, city, state or region, country, site type, and all known access restrictions such as hours, escorts, badges, security, loading docks, elevators, or parking. Preserve the stated address rather than shortening it to city and state.
- Service and scope: requested work, areas included or excluded, approximate size, removal and disconnect responsibilities, hauling, recycling, restoration, resale expectations, deliverables, and completion conditions.
- Timeline: lease expiration, requested completion date, urgency reason, and hard deadlines.
- Equipment and materials: rack or cabinet count; servers; storage; network equipment; UPS systems; batteries; generators; CRAC, CRAH, or HVAC units; copper, fiber, and power cabling; busway; raised floor; containment; quantities; dimensions; weights; condition; ownership; and resale expectations.
- Data and electrical: whether data wiping, shredding, certificates, chain of custody, electrical shutdowns, or disconnect responsibility are mentioned.
- Commercial: whether a budget or not-to-exceed amount is mentioned, whether the decision maker is identifiable, and whether a quote, estimate, proposal, or bid is requested.

LAYOUT AND EVIDENCE RULES
- Treat labels such as From, Primary Contact, Project Site, Requested Scope, Data Security, Electrical Responsibility, Access and Logistics, Safety, Commercial Information, and Attached as strong structure even when the message is pasted as plain text.
- Company names may appear in the intro sentence, signature block, site/facility name, sender header, or email domain. Do not return "Unknown Company" when a named organization is present anywhere in the source.
- Prefer the Primary Contact block over the sender header for contact name, email, phone, and preferred channel.
- Attached-file lists count as evidence already provided. Do not ask for a floor plan, inventory, site photos, dock instructions, contractor rules, or electrical responsibility matrix when the source says those items are attached.
- Use deterministic parser hints as supporting evidence, but let the raw customer communication override a hint if the source clearly contradicts it.

MISSING REQUIREMENTS
Identify up to 10 unanswered items that materially affect scope, scheduling, safety, access, documentation, or pricing. Consider site location, square footage, equipment quantities, floor plans, equipment lists, site photos, access restrictions, deadlines, data destruction, electrical responsibility, hazardous materials, asset ownership, resale expectations, budget, approval process, and decision maker.
For every missing requirement provide a stable snake_case key, a clear customer-facing label, the best matching category, an accurate severity, and a concise explanation of why it matters. Use blocking only when work cannot responsibly proceed without the answer.

CLASSIFICATION GUIDANCE
- Priority urgent: an immediate safety issue or explicit imminent deadline.
- Priority high: a firm deadline, lease pressure, major dependency, or explicit urgency.
- Priority medium: an active project with normal timing.
- Priority low: an exploratory or long-range request.
- Workload high: a large or complex multi-system, multi-site, or highly constrained project.
- Workload medium: a normal data center project or several work categories.
- Workload low: limited, clearly bounded work.
- Confidence is 0-100 based on completeness and certainty. Reduce it for unknown identity, location, scope, quantities, access, or timeline.

FINAL QUALITY CHECK
Produce a concise operational summary, a defensible directional estimate or null range, one to five practical next actions, and direct follow-up questions for unresolved requirements. Do not ask for information already present in the source.`;

const WORK_PRODUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "title", "subject", "body", "sections", "estimate", "confidenceScore", "approvalRequired", "missingRiskNotes", "nextActions"],
  properties: {
    documentType: { type: "string", enum: ["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate"] },
    title: { type: "string" },
    subject: { type: ["string", "null"] },
    body: { type: "string" },
    sections: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "body"],
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          body: { type: "string" }
        }
      }
    },
    estimate: {
      type: "object",
      additionalProperties: false,
      required: ["lowCents", "highCents", "assumptions", "lineItems"],
      properties: {
        lowCents: { type: ["integer", "null"] },
        highCents: { type: ["integer", "null"] },
        assumptions: { type: "string" },
        lineItems: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["lineType", "description", "quantity", "unit", "unitCostCents"],
            properties: {
              lineType: { type: "string", enum: ["labor", "logistics", "recycling", "equipment", "subcontractor", "contingency", "other"] },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitCostCents: { type: "integer" }
            }
          }
        }
      }
    },
    confidenceScore: { type: "integer", minimum: 0, maximum: 100 },
    approvalRequired: { type: "boolean" },
    missingRiskNotes: { type: "array", items: { type: "string" }, maxItems: 8 },
    nextActions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 }
  }
};

const ASSISTANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sources", "confidence", "unknowns", "proposedActions", "riskNotes"],
  properties: {
    answer: { type: "string" },
    sources: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "id", "label", "excerpt", "confidenceScore"],
        properties: {
          type: { type: "string" },
          id: { type: "string" },
          label: { type: "string" },
          excerpt: { type: "string" },
          confidenceScore: { type: "integer", minimum: 0, maximum: 100 }
        }
      }
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    unknowns: { type: "array", items: { type: "string" }, maxItems: 10 },
    proposedActions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["actionType", "label", "requiresConfirmation"],
        properties: {
          actionType: { type: "string" },
          label: { type: "string" },
          requiresConfirmation: { type: "boolean" }
        }
      }
    },
    riskNotes: { type: "array", items: { type: "string" }, maxItems: 8 }
  }
};

const ASSISTANT_DEVELOPER_PROMPT = [
  "You are DC Decom's grounded CRM assistant for the Mobile Intake web and mobile app.",
  "Answer only from the provided account-scoped application context, selected chat uploads, and approved knowledge snippets.",
  "Never invent customer facts, site facts, quantities, pricing, safety conditions, approval state, or commitments.",
  "If the records do not contain the answer, say what is unknown and what source would be needed.",
  "Distinguish draft, approved, reference, and unreviewed source material when that status is provided.",
  "Uploaded files are evidence for this chat, not company policy.",
  "Keep answers concise by default and make next actions practical for intake, estimating, proposal, site visit, or handoff workflows.",
  "Do not claim to send emails, approve estimates/proposals, change statuses, waive requirements, or update CRM records. Proposed actions must require confirmation.",
  "Return JSON matching the supplied schema with cited sources copied from the provided source list."
].join(" ");

const WORK_PRODUCT_REFERENCES = {
  proposal: {
    purpose: "Create a customer-ready proposal that can be reviewed internally and then sent to the decision maker.",
    requiredSections: ["Executive summary", "Scope of work", "Assumptions", "Commercial range", "Exclusions", "Customer responsibilities", "Next steps"],
    requiredData: ["customer and site identity", "service type", "known equipment or work areas", "timeline or lease pressure", "access constraints", "estimate range", "missing requirements"],
    qualityBar: "The proposal must read like a complete commercial document while clearly labeling unconfirmed facts as assumptions or risks."
  },
  scope_of_work: {
    purpose: "Create an operations-ready scope document for estimator, project manager, and field team alignment.",
    requiredSections: ["In-scope work", "Out-of-scope work", "Site conditions", "Dependencies", "Deliverables", "Acceptance criteria"],
    requiredData: ["work areas", "equipment and material categories", "access constraints", "electrical or safety notes", "documentation requirements", "open missing requirements"],
    qualityBar: "The scope must be specific enough for execution planning and must avoid commercial promises that belong in the proposal."
  },
  estimate: {
    purpose: "Create a defensible preliminary estimate with line-item basis and visible pricing assumptions.",
    requiredSections: ["Estimate range", "Line-item basis", "Assumptions", "Pricing risks", "Items that could change price"],
    requiredData: ["known quantities", "service type", "labor/logistics drivers", "access or loading constraints", "subcontractor needs", "risk assumptions"],
    qualityBar: "The estimate must explain why the range exists and what data would tighten it."
  },
  site_checklist: {
    purpose: "Create a site-visit checklist that captures all field data needed before final pricing or execution.",
    requiredSections: ["Before arrival", "Access verification", "Photos to capture", "Counts to verify", "Safety questions", "Estimator follow-up"],
    requiredData: ["site/contact access", "equipment focus", "known missing requirements", "photo needs", "safety/electrical uncertainties"],
    qualityBar: "The checklist must be actionable on a phone during a walkthrough and each item should produce useful estimator evidence."
  },
  follow_up_email: {
    purpose: "Create a polished customer follow-up that moves the inquiry forward based on the requested response goal.",
    requiredSections: ["Greeting", "Context", "Questions", "Suggested next step", "Signature"],
    requiredData: ["contact name", "project summary", "missing requirements", "timeline pressure", "preferred communication channel"],
    qualityBar: "The email must be send-ready, specific to the project, tactful about missing information, and free of generic filler."
  }
};

const FOLLOW_UP_RESPONSE_GOALS = {
  info_request: {
    label: "Request info",
    intent: "Collect the highest-impact missing details and source evidence needed for estimating or proposal generation.",
    useWhen: "Use when required information, scope evidence, data-destruction details, access information, or customer responsibilities are incomplete.",
    guidance: [
      "Open warmly and acknowledge the customer's project and timeline.",
      "Ask only for missing or uncertain items; do not request data already present in inquiry fields, missing requirements, summaries, existing documents, or file metadata.",
      "Group questions into a short, scannable list with practical labels.",
      "Explain why the requested items help pricing, schedule, safety, or scope accuracy.",
      "Close with one clear next step and offer a brief call or site review if useful."
    ]
  },
  schedule_visit: {
    label: "Schedule visit",
    intent: "Move the customer toward a site walk or coordination call while confirming only the access details needed to schedule it.",
    useWhen: "Use when the scope has enough signal to justify field verification or when constraints, counts, photos, or access need on-site confirmation.",
    guidance: [
      "Lead with the value of a site visit: tighter scope, safer planning, and better pricing confidence.",
      "Propose a low-friction scheduling path with a few availability windows rather than an open-ended request.",
      "Confirm escort, badge, loading dock, parking, PPE, and photo permissions only when they are missing or uncertain.",
      "Keep the tone professional and operational, not salesy.",
      "End with a specific scheduling ask."
    ]
  },
  proposal_ready: {
    label: "Proposal-ready",
    intent: "Confirm that DC Decom has enough information to proceed toward a proposal while naming any assumptions or final dependencies.",
    useWhen: "Use when the inquiry has strong scope detail and the next step is proposal preparation, internal review, or final dependency confirmation.",
    guidance: [
      "Summarize the understood project scope in a concise paragraph.",
      "State that DC Decom is preparing the proposal or next work product.",
      "Call out any remaining assumptions or dependencies without making the email feel blocked.",
      "Avoid asking broad discovery questions; focus on final confirmations only.",
      "Close with expected next action and timing."
    ]
  }
};

const WORK_PRODUCT_DEVELOPER_PROMPT = [
  "You are DC Decom's senior estimator and customer success drafter.",
  "Generate only practical, customer-ready work product content for data center decommissioning workflows.",
  "Use the supplied workProductReference as the controlling document brief for purpose, required sections, required data, and quality bar.",
  "For follow_up_email, use responseGoal and responseGoalReference as controlling instructions for intent, source selection, question selection, and call to action.",
  "Every required section must be represented in either sections or body unless it is irrelevant; if omitted, explain why in missingRiskNotes.",
  "Do not invent confirmed facts. Convert unknown required data into assumptions, missingRiskNotes, or nextActions.",
  "Use all available inquiry, extracted field, missing requirement, summary, and existing document data before asking for more information.",
  "For follow-up emails, infer which project files and metadata are relevant from responseGoal; do not require a user-selected source list.",
  "Treat sourceDocuments as available source evidence for this run. Use allSelectedProjectFileMetadata for awareness and avoid asking for already-uploaded files.",
  "Follow-up email bodies must be send-ready plain text with a human greeting, concise paragraphs, a short bullet list only when helpful, and a professional signature.",
  "Follow-up emails must not mention internal AI, prompt configuration, confidence scores, or app workflow labels.",
  "Apply userInstructions as explicit drafting direction unless it conflicts with known project data.",
  "Use concise professional language suitable for a mobile operations workflow."
].join(" ");

const AI_PROMPT_REGISTRY = [
  {
    id: "intake_extraction.v2026-07-04",
    runType: "intake_extraction",
    version: "2026-07-04",
    status: "active",
    schemaName: "dcdcom_intake_extraction",
    summary: "Extracts customer communications into inquiry, site, contact, missing-requirement, estimate, and next-action fields.",
    modelDefault: "gpt-5.5",
    fallback: "local-rules"
  },
  {
    id: "work_product.v2026-07-04",
    runType: "work_product",
    version: "2026-07-04",
    status: "active",
    schemaName: "dcdcom_work_product",
    summary: "Generates follow-up emails from response goals and project context, plus proposals, scopes, estimates, and site checklists from inquiry data and source documents.",
    modelDefault: "gpt-5.5",
    fallback: "local-rules"
  },
  {
    id: "chat_assistant.v2026-07-22",
    runType: "chat_assistant",
    version: "2026-07-22",
    status: "active",
    schemaName: "dcdcom_chat_assistant",
    summary: "Answers web and mobile chat questions from authorized CRM data, chat uploads, and cited knowledge/context snippets.",
    modelDefault: "gpt-5.5",
    fallback: "grounded-local-summary"
  }
];

export function listAiPromptRegistry() {
  return AI_PROMPT_REGISTRY.map((entry) => ({ ...entry }));
}

export function promptVersionForRunType(runType) {
  if (runType === "intake_extraction") return AI_PROMPT_REGISTRY[0].id;
  if (runType === "chat_assistant") return AI_PROMPT_REGISTRY[2].id;
  return AI_PROMPT_REGISTRY[1].id;
}

export async function analyzeIntake(env, { rawText, sourceChannel = "manual", subject = "", sender = "", attachmentText = "" }) {
  const normalizedText = String(rawText || "").trim();
  const hints = intakeHints(normalizedText, sourceChannel, { subject, sender, attachmentText });
  if (normalizedText.length < 12) {
    return {
      mode: "fallback",
      model: "local-rules",
      promptVersionId: promptVersionForRunType("intake_extraction"),
      extraction: fallbackExtraction(normalizedText, sourceChannel, hints),
      error: "Intake text was too short for live AI analysis."
    };
  }

  if (!env?.OPENAI_API_KEY) {
    return {
      mode: "fallback",
      model: "local-rules",
      promptVersionId: promptVersionForRunType("intake_extraction"),
      extraction: fallbackExtraction(normalizedText, sourceChannel, hints),
      error: "OPENAI_API_KEY is not configured."
    };
  }

  const started = Date.now();
  const model = env.OPENAI_MODEL || "gpt-5.5";
  try {
    const { parsed, data } = await callOpenAiJson(env, {
      model,
      schemaName: "dcdcom_intake_extraction",
      schema: INTAKE_SCHEMA,
      timeoutMs: openAiTimeoutMs(env, "intake"),
      developerText: INTAKE_DEVELOPER_PROMPT,
      userText: [
        `Source channel: ${sourceChannel}`,
        subject ? `Subject: ${subject}` : null,
        sender ? `Sender: ${sender}` : null,
        intakeHintsText(hints),
        "",
        "Customer communication:",
        normalizedText,
        attachmentText ? `\nExtracted attachment or OCR text:\n${String(attachmentText).trim()}` : null
      ].filter((value) => value !== null).join("\n")
    });
    return {
      mode: "live",
      model,
      promptVersionId: promptVersionForRunType("intake_extraction"),
      latencyMs: Date.now() - started,
      extraction: normalizeExtraction(mergeExtractionHints(parsed, hints), sourceChannel),
      rawResponseId: data.id
    };
  } catch (error) {
    return {
      mode: "fallback",
      model,
      promptVersionId: promptVersionForRunType("intake_extraction"),
      latencyMs: Date.now() - started,
      extraction: fallbackExtraction(normalizedText, sourceChannel, hints),
      error: error.message
    };
  }
}

export async function generateWorkProduct(env, { type, inquiry, fields = [], missing = [], summaries = [], documents = [], files = [], tone = "Professional", responseGoal, sourceDocumentIds, additionalContext = "" }) {
  const normalizedType = normalizeWorkProductType(type);
  const normalizedResponseGoal = normalizeResponseGoal(responseGoal);
  const selectedFiles = selectedSourceFiles(files, sourceDocumentIds);
  const sourceDocuments = uploadedFileContext(selectedFiles);
  const context = String(additionalContext || "").trim();
  const generationContext = {
    selectedSourceDocumentIds: Array.isArray(sourceDocumentIds) ? sourceDocumentIds : sourceDocuments.map((file) => file.id).filter(Boolean),
    sourceDocuments,
    responseGoal: normalizedType === "follow_up_email" ? normalizedResponseGoal : null,
    additionalContext: context || null
  };
  const fallback = () => fallbackWorkProduct({ type: normalizedType, inquiry, fields, missing, summaries, files: selectedFiles, tone, responseGoal: normalizedResponseGoal, additionalContext: context });
  if (!env?.OPENAI_API_KEY) {
    return { mode: "fallback", model: "local-rules", promptVersionId: promptVersionForRunType("work_product"), product: fallback(), generationContext, error: "OPENAI_API_KEY is not configured." };
  }
  const started = Date.now();
  const model = env.OPENAI_MODEL || "gpt-5.5";
  try {
    const { parsed, data } = await callOpenAiJson(env, {
      model,
      schemaName: "dcdcom_work_product",
      schema: WORK_PRODUCT_SCHEMA,
      developerText: WORK_PRODUCT_DEVELOPER_PROMPT,
      userText: JSON.stringify({
        requestedType: normalizedType,
        tone,
        responseGoal: normalizedType === "follow_up_email" ? normalizedResponseGoal : null,
        responseGoalReference: normalizedType === "follow_up_email" ? FOLLOW_UP_RESPONSE_GOALS[normalizedResponseGoal] : null,
        workProductReference: WORK_PRODUCT_REFERENCES[normalizedType],
        projectData: {
          inquiry,
          extractedFields: fields,
          missingRequirements: missing,
          existingSummaries: summaries,
          existingDocuments: documents
        },
        sourceDocuments,
        allSelectedProjectFileMetadata: uploadedFileContext(files),
        userInstructions: context || null
      }, null, 2)
    });
    return {
      mode: "live",
      model,
      promptVersionId: promptVersionForRunType("work_product"),
      latencyMs: Date.now() - started,
      product: normalizeWorkProduct(parsed, normalizedType, inquiry),
      generationContext,
      rawResponseId: data.id
    };
  } catch (error) {
    return {
      mode: "fallback",
      model,
      promptVersionId: promptVersionForRunType("work_product"),
      latencyMs: Date.now() - started,
      product: fallback(),
      generationContext,
      error: error.message
    };
  }
}

export async function generateAssistantResponse(env, { message, responseMode = "answer", context }) {
  const normalizedMessage = String(message || "").trim();
  const fallback = () => fallbackAssistantResponse({ message: normalizedMessage, responseMode, context });
  if (!env?.OPENAI_API_KEY) {
    return { mode: "fallback", model: "local-rules", promptVersionId: promptVersionForRunType("chat_assistant"), response: fallback(), error: "OPENAI_API_KEY is not configured." };
  }
  const started = Date.now();
  const model = env.OPENAI_MODEL || "gpt-5.5";
  try {
    const { parsed, data } = await callOpenAiJson(env, {
      model,
      schemaName: "dcdcom_chat_assistant",
      schema: ASSISTANT_SCHEMA,
      timeoutMs: openAiTimeoutMs(env, "assistant"),
      developerText: ASSISTANT_DEVELOPER_PROMPT,
      userText: JSON.stringify({
        userQuestion: normalizedMessage,
        responseMode,
        scope: context?.scope || "workspace",
        currentUser: context?.currentUser || null,
        records: context?.records || {},
        sourceList: context?.sources || [],
        recentMessages: context?.recentMessages || [],
        responseRules: {
          citeOnlyProvidedSources: true,
          requireConfirmationForWrites: true,
          doNotUseExternalKnowledge: true,
          conciseByDefault: true
        }
      }, null, 2)
    });
    return {
      mode: "live",
      model,
      promptVersionId: promptVersionForRunType("chat_assistant"),
      latencyMs: Date.now() - started,
      response: normalizeAssistantResponse(parsed, context),
      rawResponseId: data.id
    };
  } catch (error) {
    return {
      mode: "fallback",
      model,
      promptVersionId: promptVersionForRunType("chat_assistant"),
      latencyMs: Date.now() - started,
      response: fallback(),
      error: error.message
    };
  }
}

export function extractionToPreview(extraction) {
  const missingText = extraction.missingRequirements.map((item) => item.label).join(", ") || "None";
  return {
    confidence: extraction.confidenceScore,
    mode: extraction.mode || "unknown",
    summary: extraction.summary,
    rows: [
      { icon: "user", label: "Contact", value: extraction.contact.fullName || "Not provided" },
      { icon: "mail", label: "Email", value: extraction.contact.email || "Not provided" },
      { icon: "phone", label: "Phone", value: extraction.contact.phone || "Not provided" },
      { icon: "pin", label: "Site address", value: extraction.site.fullAddress || [extraction.site.city, extraction.site.region, extraction.site.country].filter(Boolean).join(", ") || "Not provided" },
      { icon: "briefcase", label: "Service", value: extraction.service.label },
      { icon: "calendar", label: "Timeline", value: extraction.timeline.leaseEndDate ? `Lease end ${extraction.timeline.leaseEndDate}` : "Missing" },
      { icon: "building", label: "Equipment", value: equipmentText(extraction) },
      { icon: "alert", label: "Missing Info", value: missingText }
    ]
  };
}

function parseResponseJson(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return JSON.parse(data.output_text);
  }
  const contentItems = (data.output || []).flatMap((item) => item.content || []);
  const textItem = contentItems.find((item) => item.type === "output_text" || item.text);
  const text = textItem?.text;
  if (!text) throw new Error("OpenAI response did not include output text.");
  return JSON.parse(text);
}

async function callOpenAiJson(env, { model, schemaName, schema, developerText, userText, timeoutMs = openAiTimeoutMs(env) }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: developerText }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userText }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema
          }
        }
      })
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`OpenAI request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed with ${response.status}`);
  }
  return { parsed: parseResponseJson(data), data };
}

function openAiTimeoutMs(env, runType = "work_product") {
  const value = Number(runType === "intake" ? env?.OPENAI_INTAKE_TIMEOUT_MS || env?.OPENAI_REQUEST_TIMEOUT_MS : env?.OPENAI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(value) && value >= 1000 && value <= 110000) return Math.round(value);
  if (runType === "intake") return 20_000;
  return 75_000;
}

function normalizeExtraction(extraction, sourceChannel) {
  const serviceLabel = extraction.service?.label || "Data Center Decommissioning";
  const serviceType = Object.values(SERVICE_TYPES).includes(extraction.service?.type)
    ? extraction.service.type
    : SERVICE_TYPES[serviceLabel] || "other";
  return {
    company: {
      name: stringOr(extraction.company?.name, "Unknown Company"),
      website: extraction.company?.website || null,
      industry: extraction.company?.industry || null
    },
    contact: {
      fullName: stringOr(extraction.contact?.fullName, "Unknown Contact"),
      email: extraction.contact?.email || null,
      phone: extraction.contact?.phone || null,
      preferredChannel: extraction.contact?.preferredChannel || channelToPreference(sourceChannel)
    },
    site: {
      name: stringOr(extraction.site?.name, `${stringOr(extraction.company?.name, "Customer")} Site`),
      fullAddress: extraction.site?.fullAddress || null,
      city: extraction.site?.city || null,
      region: extraction.site?.region || null,
      country: extraction.site?.country || "US",
      siteType: extraction.site?.siteType || "unknown",
      accessNotes: extraction.site?.accessNotes || null
    },
    service: {
      type: serviceType,
      label: serviceLabel,
      scopeBullets: nonEmptyArray(extraction.service?.scopeBullets, ["Review source communication and confirm decommissioning scope."])
    },
    timeline: {
      leaseEndDate: extraction.timeline?.leaseEndDate || null,
      requestedDueDate: extraction.timeline?.requestedDueDate || null,
      urgencyReason: extraction.timeline?.urgencyReason || null
    },
    equipment: {
      rackCount: typeof extraction.equipment?.rackCount === "number" ? extraction.equipment.rackCount : null,
      assets: Array.isArray(extraction.equipment?.assets) ? extraction.equipment.assets.filter(Boolean).slice(0, 12) : [],
      dataDestructionMentioned: Boolean(extraction.equipment?.dataDestructionMentioned),
      electricalDisconnectMentioned: Boolean(extraction.equipment?.electricalDisconnectMentioned)
    },
    commercial: {
      budgetMentioned: Boolean(extraction.commercial?.budgetMentioned),
      decisionMakerKnown: Boolean(extraction.commercial?.decisionMakerKnown),
      proposalRequested: Boolean(extraction.commercial?.proposalRequested)
    },
    missingRequirements: normalizeMissing(extraction.missingRequirements),
    summary: stringOr(extraction.summary, "AI analyzed the customer request and created an intake summary."),
    priority: ["low", "medium", "high", "urgent"].includes(extraction.priority) ? extraction.priority : "medium",
    workload: ["low", "medium", "high"].includes(extraction.workload) ? extraction.workload : "medium",
    confidenceScore: clampInt(extraction.confidenceScore, 0, 100, 64),
    estimateRange: {
      lowCents: integerOrNull(extraction.estimateRange?.lowCents),
      highCents: integerOrNull(extraction.estimateRange?.highCents),
      rationale: stringOr(extraction.estimateRange?.rationale, "Estimate requires field validation.")
    },
    nextBestActions: nonEmptyArray(extraction.nextBestActions, ["Request missing scope details."]),
    followUpQuestions: Array.isArray(extraction.followUpQuestions) ? extraction.followUpQuestions.filter(Boolean).slice(0, 10) : []
  };
}

function normalizeWorkProduct(product, type, inquiry) {
  const low = integerOrNull(product.estimate?.lowCents ?? inquiry.estimated_low_cents);
  const high = integerOrNull(product.estimate?.highCents ?? inquiry.estimated_high_cents);
  return {
    documentType: normalizeWorkProductType(product.documentType || type),
    title: stringOr(product.title, titleFor(type, inquiry)),
    subject: product.subject || null,
    body: stringOr(product.body, "Review missing requirements before sending this work product."),
    sections: Array.isArray(product.sections) ? product.sections.map((section, index) => ({
      key: String(section.key || `section_${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      title: stringOr(section.title, `Section ${index + 1}`),
      body: stringOr(section.body, "")
    })).filter((section) => section.body).slice(0, 8) : [],
    estimate: {
      lowCents: low,
      highCents: high,
      assumptions: stringOr(product.estimate?.assumptions, "Estimate is preliminary and subject to site verification."),
      lineItems: normalizeLineItems(product.estimate?.lineItems, low, high)
    },
    confidenceScore: clampInt(product.confidenceScore, 0, 100, inquiry.confidence_score || 65),
    approvalRequired: Boolean(product.approvalRequired ?? true),
    missingRiskNotes: Array.isArray(product.missingRiskNotes) ? product.missingRiskNotes.filter(Boolean).slice(0, 8) : [],
    nextActions: nonEmptyArray(product.nextActions, ["Review and approve before sending."])
  };
}

function normalizeLineItems(items, low, high) {
  if (!Array.isArray(items) || !items.length) {
    const target = high || low || 2500000;
    return [
      { lineType: "labor", description: "Decommissioning labor", quantity: 1, unit: "project", unitCostCents: Math.round(target * 0.45) },
      { lineType: "logistics", description: "Logistics and trucking", quantity: 1, unit: "project", unitCostCents: Math.round(target * 0.25) },
      { lineType: "contingency", description: "Scope contingency", quantity: 1, unit: "project", unitCostCents: Math.round(target * 0.15) }
    ];
  }
  return items.map((item) => ({
    lineType: ["labor", "logistics", "recycling", "equipment", "subcontractor", "contingency", "other"].includes(item.lineType) ? item.lineType : "other",
    description: stringOr(item.description, "Project line item"),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: stringOr(item.unit, "each"),
    unitCostCents: integerOrNull(item.unitCostCents) || 0
  })).slice(0, 8);
}

function fallbackWorkProduct({ type, inquiry, fields, missing, summaries, files, tone, responseGoal = "info_request", additionalContext = "" }) {
  const field = (key) => fields.find((item) => item.field_key === key)?.value_text;
  const missingLabels = missing.map((item) => item.label);
  const sourceFiles = uploadedFileContext(files);
  const sourceFileText = sourceFiles.length
    ? `Source files available: ${sourceFiles.map((file) => `${file.categoryLabel}: ${file.fileName}`).join("; ")}.`
    : "No uploaded source files are available yet.";
  const instructionText = additionalContext ? ` User instructions: ${additionalContext}` : "";
  const summary = summaries[0]?.body || `${inquiry.company_name || "Customer"} requested ${serviceLabelFromType(inquiry.service_type).toLowerCase()}.`;
  const low = inquiry.estimated_low_cents || 2500000;
  const high = inquiry.estimated_high_cents || 4500000;
  const sections = [
    {
      key: "scope",
      title: "Scope",
      body: `Provide turnkey ${serviceLabelFromType(inquiry.service_type).toLowerCase()} for ${inquiry.title}, including equipment removal, cable management, recycling coordination, and site cleanup.`
    },
    {
      key: "assumptions",
      title: "Assumptions",
      body: `Assumes normal site access, customer-provided approvals, and no hidden hazardous or energized conditions. ${sourceFileText}${instructionText} Missing items: ${missingLabels.join(", ") || "none identified"}.`
    },
    {
      key: "deliverables",
      title: "Deliverables",
      body: "Deliverables include project plan, field checklist, removal/recycling documentation, and closeout summary."
    }
  ];
  const bodyByType = {
    follow_up_email: fallbackFollowUpEmail({ inquiry, missingLabels, sourceFiles, summary, responseGoal }),
    scope_of_work: sections.map((section) => `${section.title}\n${section.body}`).join("\n\n"),
    proposal: sections.map((section) => `${section.title}\n${section.body}`).join("\n\n"),
    site_checklist: [
      "Confirm escort and access window",
      "Photograph racks, cable pathways, and electrical disconnects",
      "Validate equipment counts and asset disposition needs",
      "Confirm data destruction requirements",
      "Capture floor plan or marked-up site sketch"
    ].join("\n"),
    estimate: `Preliminary estimate range: ${centsText(low)} - ${centsText(high)}. Assumptions should be reviewed after site verification.`
  };
  return normalizeWorkProduct({
    documentType: type,
    title: titleFor(type, inquiry),
    subject: type === "follow_up_email" ? followUpSubject(inquiry, responseGoal) : null,
    body: bodyByType[type] || bodyByType.scope_of_work,
    sections,
    estimate: {
      lowCents: low,
      highCents: high,
      assumptions: `Preliminary range based on ${serviceLabelFromType(inquiry.service_type)} and known fields: ${field("equipment_assets") || "equipment inventory pending"}.`,
      lineItems: normalizeLineItems([], low, high)
    },
    confidenceScore: Math.max(50, Number(inquiry.confidence_score || 70) - missingLabels.length * 3),
    approvalRequired: true,
    missingRiskNotes: missingLabels.map((label) => `${label} may affect price or schedule.`),
    nextActions: missingLabels.length ? ["Send follow-up questions", "Schedule site visit", "Review estimate assumptions"] : ["Review estimate", "Send proposal for approval"]
  }, type, inquiry);
}

function normalizeAssistantResponse(response, context = {}) {
  const allowedSources = new Map((context.sources || []).map((source) => [`${source.type}:${source.id}`, source]));
  const sources = Array.isArray(response.sources) ? response.sources.map((source) => {
    const matched = allowedSources.get(`${source.type}:${source.id}`) || allowedSources.get(`${source.sourceType}:${source.sourceId}`) || null;
    return {
      type: matched?.type || String(source.type || source.sourceType || "record"),
      id: matched?.id || String(source.id || source.sourceId || "unknown"),
      label: String(matched?.label || source.label || "Source").slice(0, 160),
      excerpt: String(matched?.excerpt || source.excerpt || "").slice(0, 900),
      confidenceScore: clampInt(source.confidenceScore, 0, 100, matched?.confidenceScore || 75),
      metadata: matched?.metadata || {}
    };
  }).filter((source) => source.id !== "unknown").slice(0, 12) : [];
  const fallbackSources = sources.length ? sources : (context.sources || []).slice(0, 6).map((source) => ({
    type: source.type,
    id: source.id,
    label: source.label,
    excerpt: source.excerpt || "",
    confidenceScore: source.confidenceScore || 70,
    metadata: source.metadata || {}
  }));
  return {
    answer: stringOr(response.answer, "I could not find enough sourced information to answer from the available records."),
    sources: fallbackSources,
    confidence: ["low", "medium", "high"].includes(response.confidence) ? response.confidence : (fallbackSources.length ? "medium" : "low"),
    unknowns: Array.isArray(response.unknowns) ? response.unknowns.filter(Boolean).map(String).slice(0, 10) : [],
    proposedActions: normalizeAssistantActions(response.proposedActions),
    riskNotes: Array.isArray(response.riskNotes) ? response.riskNotes.filter(Boolean).map(String).slice(0, 8) : []
  };
}

function fallbackAssistantResponse({ message, responseMode, context = {} }) {
  const sources = (context.sources || []).slice(0, 8).map((source) => ({
    type: source.type,
    id: source.id,
    label: source.label,
    excerpt: source.excerpt || "",
    confidenceScore: source.confidenceScore || 70,
    metadata: source.metadata || {}
  }));
  const records = context.records || {};
  const inquiry = records.inquiry?.inquiry;
  const missing = records.inquiry?.missing || [];
  const uploads = records.chatFiles || [];
  const lower = String(message || "").toLowerCase();
  const answerParts = [];

  if (inquiry) {
    answerParts.push(`${inquiry.title} is currently ${stageLabel(inquiry.status)} with ${inquiry.priority || "medium"} priority.`);
    const location = [inquiry.site_name, inquiry.city, inquiry.region].filter(Boolean).join(", ");
    if (location) answerParts.push(`Site context: ${location}.`);
    if (inquiry.company_name || inquiry.contact_name) answerParts.push(`Customer context: ${[inquiry.company_name, inquiry.contact_name].filter(Boolean).join(" / ")}.`);
    if (missing.length) answerParts.push(`Open or unresolved requirements include ${missing.slice(0, 6).map((item) => item.label).join("; ")}.`);
    else answerParts.push("The current record does not show open missing requirements.");
    if (records.inquiry?.summaries?.[0]?.body) answerParts.push(`Latest summary: ${records.inquiry.summaries[0].body}`);
  } else if (Array.isArray(records.inquiries)) {
    const active = records.inquiries.filter((item) => !["won", "lost", "archived"].includes(item.status));
    answerParts.push(`I found ${records.inquiries.length} visible inquiries, including ${active.length} active records.`);
    const needsInfo = records.inquiries.filter((item) => item.status === "needs_info" || Number(item.missing_count || 0) > 0).slice(0, 6);
    if (needsInfo.length) answerParts.push(`Records needing information: ${needsInfo.map((item) => `${item.title} (${Number(item.missing_count || 0)} missing)`).join("; ")}.`);
  }

  if (uploads.length) answerParts.push(`This chat includes ${uploads.length} uploaded ${uploads.length === 1 ? "file" : "files"}: ${uploads.map((file) => file.file_name || file.fileName).slice(0, 5).join(", ")}.`);
  if (lower.includes("draft") || responseMode === "draft") answerParts.push("I can draft text here, but it must be saved or sent through a confirmed app action before it becomes CRM data.");
  if (lower.includes("missing") && !missing.length && inquiry) answerParts.push("No missing requirement records matched that request, so this should be verified against the latest customer evidence.");

  return {
    answer: answerParts.join(" "),
    sources,
    confidence: sources.length ? "medium" : "low",
    unknowns: sources.length ? [] : ["No authorized source records were available for this answer."],
    proposedActions: defaultAssistantActions({ inquiry, responseMode, lower }),
    riskNotes: ["This response is generated from retrieved app context only and should be reviewed before customer-facing use."]
  };
}

function normalizeAssistantActions(actions) {
  const normalized = Array.isArray(actions) ? actions : [];
  return normalized.map((action) => ({
    actionType: String(action.actionType || action.action_type || "review").slice(0, 80),
    label: String(action.label || "Review suggested action").slice(0, 160),
    requiresConfirmation: action.requiresConfirmation !== false
  })).slice(0, 8);
}

function defaultAssistantActions({ inquiry, responseMode, lower }) {
  const actions = [];
  if (inquiry) actions.push({ actionType: "save_note", label: "Save answer as an internal note", requiresConfirmation: true });
  if (inquiry && (responseMode === "draft" || lower.includes("draft") || lower.includes("email"))) actions.push({ actionType: "create_draft", label: "Create a reviewed draft document", requiresConfirmation: true });
  if (inquiry && (lower.includes("missing") || lower.includes("ask"))) actions.push({ actionType: "review_missing_requirements", label: "Review missing information on the inquiry", requiresConfirmation: true });
  return actions;
}

function fallbackFollowUpEmail({ inquiry, missingLabels, sourceFiles, summary, responseGoal }) {
  const goal = normalizeResponseGoal(responseGoal);
  const contact = inquiry.contact_name || "there";
  const project = inquiry.title || "your project";
  const uploadedCategories = new Set(sourceFiles.map((file) => file.category));
  const hasFloorPlan = uploadedCategories.has("floor_plan");
  const hasEquipmentList = uploadedCategories.has("equipment_list");
  const hasPhotos = uploadedCategories.has("photo") || sourceFiles.some((file) => String(file.contentType || "").startsWith("image/"));
  const usefulMissing = missingLabels.slice(0, 5);
  const evidenceRequests = [
    !hasFloorPlan ? "floor plan or marked-up layout" : null,
    !hasEquipmentList ? "equipment inventory or asset list" : null,
    !hasPhotos ? "current site photos of the work areas, access path, and loading dock" : null
  ].filter(Boolean);

  if (goal === "schedule_visit") {
    return [
      `Hi ${contact},`,
      "",
      `Thank you for the details on ${project}. Based on what we have so far, a short site review would help us validate the scope, access path, safety requirements, and any assumptions before we tighten pricing.`,
      "",
      "Could you send a few available windows for a walkthrough next week? We can work around your escort and security process.",
      "",
      usefulMissing.length ? `Before we arrive, it would also help to confirm: ${usefulMissing.join("; ")}.` : "If there are any escort, PPE, photo, or loading-dock requirements we should plan around, please send those over before the visit.",
      "",
      "Best regards,",
      "DC Decom Team"
    ].join("\n");
  }

  if (goal === "proposal_ready") {
    return [
      `Hi ${contact},`,
      "",
      `Thank you for the project information for ${project}. We have enough detail to begin preparing the next draft, and our current understanding is: ${summary}`,
      "",
      usefulMissing.length
        ? `We will treat the following items as proposal assumptions unless you want to update them first: ${usefulMissing.join("; ")}.`
        : "We will proceed using the provided scope, schedule, and site information.",
      "",
      "Our next step is to prepare the response package and call out any remaining dependencies clearly for your review.",
      "",
      "Best regards,",
      "DC Decom Team"
    ].join("\n");
  }

  return [
    `Hi ${contact},`,
    "",
    `Thank you for reaching out about ${project}. ${summary}`,
    "",
    usefulMissing.length || evidenceRequests.length
      ? "To prepare an accurate response, could you please send or confirm the following?"
      : "We have the core project details and can begin reviewing next steps.",
    ...(usefulMissing.length || evidenceRequests.length ? [
      "",
      ...[...usefulMissing, ...evidenceRequests].slice(0, 7).map((item) => `- ${item}`)
    ] : []),
    "",
    "Once we have that, we can tighten the scope, schedule, and pricing assumptions and move the project forward.",
    "",
    "Best regards,",
    "DC Decom Team"
  ].join("\n");
}

function followUpSubject(inquiry, responseGoal) {
  const title = inquiry.title || "your project";
  const goal = normalizeResponseGoal(responseGoal);
  if (goal === "schedule_visit") return `Site review for ${title}`;
  if (goal === "proposal_ready") return `Next steps for ${title}`;
  return `Follow-up on ${title}`;
}

function uploadedFileContext(files = []) {
  return files
    .filter((file) => file?.category !== "document_export")
    .slice(0, 12)
    .map((file) => ({
      id: file.id || null,
      fileName: file.file_name || file.fileName || "Uploaded file",
      category: file.category || "other",
      categoryLabel: fileCategoryLabel(file.category),
      contentType: file.content_type || file.contentType || null,
      sizeBytes: file.size_bytes || file.sizeBytes || null,
      uploadedAt: file.uploaded_at || file.uploadedAt || null
    }));
}

function selectedSourceFiles(files = [], sourceDocumentIds) {
  const usableFiles = files.filter((file) => file?.category !== "document_export");
  if (!Array.isArray(sourceDocumentIds)) return usableFiles;
  const selected = new Set(sourceDocumentIds.map(String));
  return usableFiles.filter((file) => selected.has(String(file.id)));
}

function normalizeWorkProductType(type) {
  const normalized = String(type || "follow_up_email").toLowerCase();
  if (["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate"].includes(normalized)) return normalized;
  return "follow_up_email";
}

function normalizeResponseGoal(value) {
  const normalized = String(value || "info_request").toLowerCase();
  return Object.prototype.hasOwnProperty.call(FOLLOW_UP_RESPONSE_GOALS, normalized) ? normalized : "info_request";
}

function titleFor(type, inquiry) {
  const label = {
    follow_up_email: "Follow-up Email",
    proposal: "Proposal Draft",
    scope_of_work: "Scope of Work",
    site_checklist: "Site Visit Checklist",
    estimate: "Estimate"
  }[type] || "Generated Document";
  return `${label} - ${inquiry.title || inquiry.company_name || "Inquiry"}`;
}

function serviceLabelFromType(type) {
  return Object.entries(SERVICE_TYPES).find(([, value]) => value === type)?.[0] || "Data Center Decommissioning";
}

function centsText(cents) {
  return `$${Math.round(Number(cents || 0) / 100).toLocaleString()}`;
}

function fallbackExtraction(text, sourceChannel, hints = intakeHints(text, sourceChannel)) {
  const lower = text.toLowerCase();
  const companyName = hints.companyName || knownCompanyName(text) || "Unknown Company";
  const contactName = hints.contactName || /(?:spoke with|contact is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i.exec(text)?.[1] || "Unknown Contact";
  const location = hints.city || hints.region ? [hints.city || null, hints.region || null] : fallbackLocation(text);
  const serviceLabel = /data center|data hall|rack|cabinet|decommissioning/.test(lower) ? "Data Center Decommissioning" : lower.includes("hvac") ? "HVAC Removal" : lower.includes("cable") ? "Cable Abatement" : lower.includes("electrical") ? "Electrical Decommissioning" : "Data Center Decommissioning";
  const rackCount = hints.rackCount ?? rackCountFromText(text);
  const assets = mergeUnique([rackCount ? `${rackCount} racks` : null, ...hints.assets]);
  const missing = fallbackMissing(text, hints, rackCount);
  const confidence = Math.max(48, 92 - missing.length * 5 - (companyName === "Unknown Company" ? 12 : 0));
  const lowCents = hints.budgetCents ? null : serviceLabel === "Data Center Decommissioning" ? 2500000 : serviceLabel === "Cable Abatement" ? 800000 : 1200000;
  const highCents = hints.budgetCents || (serviceLabel === "Data Center Decommissioning" ? 4500000 : serviceLabel === "Cable Abatement" ? 1400000 : 2800000);
  const scopeBullets = mergeUnique([
    ...scopeBulletsFromText(text),
    ...scopeFor(serviceLabel, assets)
  ]).slice(0, 8);

  return normalizeExtraction({
    company: { name: companyName, website: null, industry: /data center|rack|cabinet|hosting|cloud|colo/i.test(text) ? "Data Centers" : null },
    contact: { fullName: contactName, email: hints.email || emailFrom(text), phone: hints.phone || phoneFrom(text), preferredChannel: hints.preferredChannel || channelToPreference(sourceChannel) },
    site: {
      name: hints.siteName || (companyName === "Unknown Company" ? "Customer Site" : `${companyName} Site`),
      fullAddress: hints.fullAddress || addressFrom(text),
      city: location[0],
      region: location[1],
      country: hints.country || "US",
      siteType: /data center|rack|cabinet|data hall|colo/i.test(text) ? "data_center" : "unknown",
      accessNotes: hints.accessNotes || accessFrom(text)
    },
    service: {
      type: SERVICE_TYPES[serviceLabel] || "other",
      label: serviceLabel,
      scopeBullets
    },
    timeline: {
      leaseEndDate: hints.leaseEndDate || dateFrom(text),
      requestedDueDate: hints.requestedDueDate,
      urgencyReason: hints.urgencyReason || (/lease|closing|urgent|asap|deadline|turnover/i.test(text) ? "Customer mentioned deadline or turnover timing." : null)
    },
    equipment: {
      rackCount,
      assets,
      dataDestructionMentioned: /data destruction|data sanitization|drive|media|wipe|shred|nist|chain-of-custody/i.test(text),
      electricalDisconnectMentioned: /disconnect|lockout|tagout|loto|utility|shutoff|electrical|building power/i.test(text)
    },
    commercial: {
      budgetMentioned: Boolean(hints.budgetCents) || /\$|budget|not[- ]?to[- ]?exceed/i.test(text),
      decisionMakerKnown: /decision maker|approval|director|manager|owner|vp|vice president/i.test(text),
      proposalRequested: /proposal|quote|estimate|bid|formal proposal/i.test(text)
    },
    missingRequirements: missing.map(([key, label, category, severity, reason]) => ({ key, label, category, severity, reason })),
    summary: `Customer communication appears to request ${serviceLabel.toLowerCase()}${location[0] ? ` in ${location[0]}, ${location[1]}` : ""}. ${missing.length ? "Remaining assumptions should be confirmed before final pricing." : "The request has enough detail for estimating review."}`,
    priority: /urgent|asap|lease|closing|deadline|turnover/i.test(text) ? "high" : "medium",
    workload: /data center|data hall|40 racks|hvac|electrical|\b\d{3,}\s+servers?|\b\d{3,}\s+battery/i.test(text) ? "high" : "low",
    confidenceScore: confidence,
    estimateRange: { lowCents, highCents, rationale: hints.budgetCents ? "Fallback range uses the stated not-to-exceed budget as the upper bound." : "Fallback range based on service type and detected equipment signals." },
    nextBestActions: missing.length ? ["Review source details", "Confirm remaining assumptions", "Prepare proposal checklist"] : ["Prepare proposal draft", "Review attached inventory and site materials", "Confirm mobilization dependencies"],
    followUpQuestions: missing.map(([, label]) => `Can you confirm ${label.toLowerCase()}?`)
  }, sourceChannel);
}

function intakeHints(text, sourceChannel, context = {}) {
  const source = cleanSourceText([context.sender ? `From: ${context.sender}` : null, context.subject ? `Subject: ${context.subject}` : null, text, context.attachmentText].filter(Boolean).join("\n"));
  const sections = sectionsFrom(source);
  const fromLine = /^From:\s*(.+)$/im.exec(source)?.[1] || context.sender || "";
  const contactBlock = sections.get("primary contact") || "";
  const siteBlock = sections.get("project site") || "";
  const attachedBlock = sections.get("attached") || "";
  const contactName = contactFromBlock(contactBlock) || contactFromFromLine(fromLine) || contactFromCasualSource(source);
  const email = emailFrom(contactBlock) || emailFrom(fromLine) || emailFrom(source);
  const phone = phoneFrom(contactBlock) || phoneFrom(source);
  const siteName = siteNameFromBlock(siteBlock);
  const fullAddress = addressFromProjectSite(siteBlock) || addressFrom(source);
  const siteLocation = locationFromAddress(fullAddress || siteBlock) || {};
  const companyName = companyFromIntro(source) || companyFromCasualSource(source) || companyFromSignature(source, contactName) || knownCompanyName(source) || companyFromSiteName(siteName) || companyFromEmail(email);
  const requestedDueDate = dateNear(source, [
    /(?:completed|complete|finished|finish|done)\s+by\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*20\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20\d{2})?)/i,
    /(?:work\s+completed\s+by|completion\s+deadline\s+is)\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*20\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20\d{2})?)/i
  ]);
  const leaseEndDate = dateNear(source, [
    /(?:landlord turnover deadline|lease expiration|lease expires|turnover deadline)\s+(?:is\s+)?([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*20\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20\d{2})?)/i
  ]);
  const proposalDueDate = dateNear(source, [
    /(?:proposal|bid|estimate)\s+(?:by|due)\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*20\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/(?:20\d{2})?)/i
  ]);
  const attachments = attachmentHints(attachedBlock || source);
  return {
    companyName,
    contactName,
    email,
    phone,
    preferredChannel: /email is preferred|prefer email/i.test(source) ? "email" : channelToPreference(sourceChannel),
    siteName,
    fullAddress,
    city: siteLocation.city || null,
    region: siteLocation.region || null,
    country: siteLocation.country || (/usa|united states/i.test(source) ? "US" : null),
    accessNotes: accessHints(source),
    rackCount: rackCountFromText(source),
    assets: assetHints(source),
    leaseEndDate,
    requestedDueDate,
    proposalDueDate,
    urgencyReason: leaseEndDate || requestedDueDate ? "Customer stated project completion or turnover deadlines." : null,
    budgetCents: budgetCentsFrom(source),
    attachments
  };
}

function intakeHintsText(hints) {
  const useful = {
    companyName: hints.companyName,
    contactName: hints.contactName,
    email: hints.email,
    phone: hints.phone,
    preferredChannel: hints.preferredChannel,
    siteName: hints.siteName,
    fullAddress: hints.fullAddress,
    city: hints.city,
    region: hints.region,
    country: hints.country,
    rackCount: hints.rackCount,
    assets: hints.assets,
    leaseEndDate: hints.leaseEndDate,
    requestedDueDate: hints.requestedDueDate,
    proposalDueDate: hints.proposalDueDate,
    budgetCents: hints.budgetCents,
    attachments: Object.entries(hints.attachments || {}).filter(([, value]) => value).map(([key]) => key)
  };
  const compact = Object.fromEntries(Object.entries(useful).filter(([, value]) => Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== ""));
  if (!Object.keys(compact).length) return null;
  return `Deterministic parser hints (supporting evidence; raw source controls if contradicted):\n${JSON.stringify(compact, null, 2)}`;
}

function mergeExtractionHints(extraction, hints) {
  const next = {
    ...extraction,
    company: { ...(extraction.company || {}) },
    contact: { ...(extraction.contact || {}) },
    site: { ...(extraction.site || {}) },
    timeline: { ...(extraction.timeline || {}) },
    equipment: { ...(extraction.equipment || {}) },
    commercial: { ...(extraction.commercial || {}) },
    estimateRange: { ...(extraction.estimateRange || {}) }
  };
  if (hints.companyName && (!next.company.name || /^unknown company$/i.test(next.company.name))) next.company.name = hints.companyName;
  if (hints.contactName && (!next.contact.fullName || /^unknown contact$/i.test(next.contact.fullName))) next.contact.fullName = hints.contactName;
  if (hints.email && !next.contact.email) next.contact.email = hints.email;
  if (hints.phone && !next.contact.phone) next.contact.phone = hints.phone;
  if (hints.preferredChannel && (!next.contact.preferredChannel || next.contact.preferredChannel === "unknown")) next.contact.preferredChannel = hints.preferredChannel;
  if (hints.siteName && (!next.site.name || /^customer site$/i.test(next.site.name))) next.site.name = hints.siteName;
  if (hints.fullAddress && !next.site.fullAddress) next.site.fullAddress = hints.fullAddress;
  if (hints.city && !next.site.city) next.site.city = hints.city;
  if (hints.region && !next.site.region) next.site.region = hints.region;
  if (hints.country && !next.site.country) next.site.country = hints.country;
  if (hints.accessNotes && !next.site.accessNotes) next.site.accessNotes = hints.accessNotes;
  if (hints.leaseEndDate && !next.timeline.leaseEndDate) next.timeline.leaseEndDate = hints.leaseEndDate;
  if (hints.requestedDueDate && !next.timeline.requestedDueDate) next.timeline.requestedDueDate = hints.requestedDueDate;
  if (hints.urgencyReason && !next.timeline.urgencyReason) next.timeline.urgencyReason = hints.urgencyReason;
  if (typeof hints.rackCount === "number" && typeof next.equipment.rackCount !== "number") next.equipment.rackCount = hints.rackCount;
  next.equipment.assets = mergeUnique([...(Array.isArray(next.equipment.assets) ? next.equipment.assets : []), ...hints.assets]).slice(0, 12);
  if (/data destruction|data sanitization|nist|wipe|shred|chain-of-custody/i.test(JSON.stringify(hints.assets))) next.equipment.dataDestructionMentioned = true;
  if (hints.budgetCents) {
    next.commercial.budgetMentioned = true;
    if (!next.estimateRange.highCents) next.estimateRange.highCents = hints.budgetCents;
    if (!next.estimateRange.rationale) next.estimateRange.rationale = "Uses the customer-stated not-to-exceed budget as an upper bound.";
  }
  if (Array.isArray(next.missingRequirements)) {
    next.missingRequirements = next.missingRequirements.filter((item) => !missingSatisfiedByHints(item, hints));
  }
  return next;
}

function fallbackMissing(text, hints, rackCount) {
  const missing = [];
  if (!/square|sq\.?\s*ft|suite size|data hall/i.test(text)) missing.push(["square_footage", "Square footage / suite size", "scope", "high", "Sizing is needed for labor and logistics assumptions."]);
  if (!rackCount && /rack|cabinet|data center/i.test(text)) missing.push(["rack_count", "Number of racks / cabinets", "equipment", "high", "Rack count drives labor, recycling, and trucking."]);
  if (!hints.accessNotes && !/access|after hours|business hours|badge|escort|security|loading dock|freight elevator|working hours/i.test(text)) missing.push(["access_hours", "Site access hours or restrictions", "access", "high", "Crew scheduling depends on access windows."]);
  if (!hints.attachments?.floorPlan && !/floor plan|drawing|plan/i.test(text)) missing.push(["floor_plan", "Floor plan or site drawings", "documentation", "medium", "Drawings reduce site visit and proposal risk."]);
  if (!/data destruction|data sanitization|drive|media|wipe|shred|nist/i.test(text)) missing.push(["data_destruction", "Data destruction requirements", "scope", "medium", "Media handling changes chain-of-custody and cost."]);
  if (!/disconnect|utility|shutoff|electrical|lockout|tagout|loto/i.test(text)) missing.push(["electrical_disconnect", "Electrical disconnect responsibility", "safety", "high", "Electrical responsibility must be known before scope approval."]);
  return missing.filter(([key]) => !missingSatisfiedByHints({ key }, hints));
}

function missingSatisfiedByHints(item, hints) {
  const key = String(item?.key || "").toLowerCase();
  const label = String(item?.label || "").toLowerCase();
  const text = `${key} ${label}`;
  if (hints.attachments?.floorPlan && /floor|drawing|plan/.test(text)) return true;
  if (hints.attachments?.equipmentList && /equipment|inventory|asset/.test(text)) return true;
  if (hints.attachments?.sitePhotos && /photo|image|picture/.test(text)) return true;
  if (hints.attachments?.dockInstructions && /dock|elevator|loading|access/.test(text)) return true;
  if (hints.attachments?.electricalMatrix && /electrical|disconnect|responsibility/.test(text)) return true;
  return false;
}

function cleanSourceText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, "$1")
    .replace(/mailto:/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n");
}

const INTAKE_SECTION_NAMES = new Map([
  ["primary contact", "primary contact"],
  ["project site", "project site"],
  ["requested scope", "requested scope"],
  ["data security", "data security"],
  ["electrical responsibility", "electrical responsibility"],
  ["access and logistics", "access and logistics"],
  ["safety", "safety"],
  ["commercial information", "commercial information"],
  ["attached", "attached"],
  ["attachments", "attached"]
]);

function sectionsFrom(text) {
  const sections = new Map();
  let current = null;
  for (const line of String(text || "").split("\n")) {
    const key = line.trim().replace(/:$/, "").toLowerCase();
    if (INTAKE_SECTION_NAMES.has(key)) {
      current = INTAKE_SECTION_NAMES.get(key);
      if (!sections.has(current)) sections.set(current, "");
      continue;
    }
    if (current) sections.set(current, `${sections.get(current)}\n${line}`.trim());
  }
  return sections;
}

function contactFromBlock(block) {
  const line = String(block || "").split("\n").map((item) => item.trim()).find((item) => item && !/@/.test(item) && !phoneFrom(item));
  const name = line?.split(",")[0]?.trim();
  return isPersonName(name) ? name : null;
}

function contactFromFromLine(line) {
  const display = String(line || "").replace(/\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}.*$/i, "").trim();
  return isPersonName(display) ? display : null;
}

function contactFromCasualSource(text) {
  const match = /(?:spoke with|contact is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s+from|\s+at|[,.]|$)/i.exec(String(text || ""));
  return match ? match[1].trim() : null;
}

function isPersonName(value) {
  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(String(value || "").trim());
}

function companyFromIntro(text) {
  const source = String(text || "");
  return cleanCompanyName(
    /^([A-Z][A-Za-z0-9&.' -]{2,100}?),\s+(?:a|an|the)\s+[^.\n]+?\s+(?:is|are)\s+(?:requesting|seeking|looking|asking)\b/im.exec(source)?.[1]
    || /^([A-Z][A-Za-z0-9&.' -]{2,100}?)\s+(?:is|are)\s+(?:requesting|seeking|looking|asking)\b/im.exec(source)?.[1]
  );
}

function companyFromCasualSource(text) {
  return cleanCompanyName(/(?:from|at)\s+([A-Z][A-Za-z0-9&.' -]{2,80}?)(?:\s+in\s+[A-Z][A-Za-z.' -]+,\s*[A-Z]{2}|[,.]|$)/.exec(String(text || ""))?.[1]);
}

function companyFromSignature(text, contactName) {
  const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const start = contactName ? lastIndexMatching(lines, (line) => line.toLowerCase() === contactName.toLowerCase()) : -1;
  if (start < 0 && !lines.some((line) => /^(thank you|thanks|regards|best|sincerely),?$/i.test(line))) return null;
  const candidates = (start >= 0 ? lines.slice(start + 1, start + 5) : lines.slice(-8)).filter((line) => !(isPersonName(line) && !looksLikeCompanyLine(line)) && !/@/.test(line) && !phoneFrom(line));
  return cleanCompanyName(candidates.find(looksLikeCompanyLine));
}

function lastIndexMatching(values, predicate) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) return index;
  }
  return -1;
}

function knownCompanyName(text) {
  if (/ntt data/i.test(text)) return "NTT Data";
  if (/cushman/i.test(text)) return "Cushman & Wakefield";
  if (/digital realty/i.test(text)) return "Digital Realty";
  if (/equinix/i.test(text)) return "Equinix";
  return null;
}

function looksLikeCompanyLine(line) {
  return /\b(services|systems|solutions|compute|data|cloud|hosting|technologies|technology|telecom|communications|corp|corporation|inc|llc|ltd|group|partners|realty)\b/i.test(line);
}

function cleanCompanyName(value) {
  const cleaned = String(value || "").replace(/^\d+\.\s*/, "").replace(/[.,;:]+$/, "").trim();
  if (!cleaned || cleaned.length < 3 || (isPersonName(cleaned) && !looksLikeCompanyLine(cleaned))) return null;
  return cleaned;
}

function companyFromEmail(email) {
  const domain = String(email || "").split("@")[1]?.split(".")[0];
  if (!domain || ["gmail", "outlook", "yahoo", "icloud", "hotmail", "example"].includes(domain.toLowerCase())) return null;
  return domain.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function siteNameFromBlock(block) {
  return String(block || "").split("\n").map((line) => line.trim()).find((line) => line && !/^\d/.test(line) && !/@/.test(line) && !phoneFrom(line)) || null;
}

function companyFromSiteName(siteName) {
  if (!siteName) return null;
  return cleanCompanyName(siteName.replace(/\b(data center|suite|facility|campus|site|dc|colo|colocation)\b.*$/i, "").trim());
}

function addressFromProjectSite(block) {
  const lines = String(block || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const streetIndex = lines.findIndex((line) => /^\d{1,6}\s+/.test(line));
  if (streetIndex < 0) return null;
  const cityLine = lines.slice(streetIndex + 1).find((line) => /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i.test(line));
  return cityLine ? `${lines[streetIndex]}, ${cityLine}` : lines[streetIndex];
}

function locationFromAddress(value) {
  const match = /,\s*([A-Z][A-Za-z.' -]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?(?:,\s*(USA|US|United States))?/i.exec(String(value || ""));
  if (!match) return null;
  return { city: match[1].trim(), region: match[2].toUpperCase(), country: match[3] ? "US" : null };
}

function fallbackLocation(text) {
  if (/ashburn/i.test(text)) return ["Ashburn", "VA"];
  if (/phoenix/i.test(text)) return ["Phoenix", "AZ"];
  if (/washington|dc/i.test(text)) return ["Washington", "DC"];
  if (/chicago/i.test(text)) return ["Chicago", "IL"];
  return [null, null];
}

function rackCountFromText(text) {
  const match = /(\d[\d,]*)\s*(?:server\s+)?(?:racks?|cabinets?)/i.exec(text);
  return match ? numberFromQuantity(match[1]) : null;
}

function assetHints(text) {
  const source = String(text || "");
  const assets = [];
  addAsset(assets, /(\d[\d,]*)\s+server racks?/i, source, (count) => `${count} server racks`);
  addAsset(assets, /(\d[\d,]*)\s+servers\b/i, source, (count) => `${count} servers`);
  addAsset(assets, /(\d[\d,]*)\s+storage arrays?/i, source, (count) => `${count} storage arrays`);
  addAsset(assets, /(\d[\d,]*)\s+network devices?/i, source, (count) => `${count} network devices`);
  addAsset(assets, /(one|two|three|four|five|six|seven|eight|nine|ten|\d[\d,]*)\s+in-row cooling units?/i, source, (count) => `${count} in-row cooling units`);
  addAsset(assets, /(\d[\d,]*)\s*kVA\s+UPS/i, source, (count) => `${count} kVA UPS system`);
  addAsset(assets, /(\d[\d,]*)\s+battery cabinets?/i, source, (count) => `${count} battery cabinets`);
  addAsset(assets, /(\d[\d,]*)\s*(?:feet|ft)\s+of\s+[^.\n]*cabling/i, source, (count) => `${count} feet of cabling`);
  addAsset(assets, /(\d[\d,]*)\s+hard drives?/i, source, (count) => `${count} hard drives for data sanitization`);
  addAsset(assets, /(\d[\d,]*)\s+solid-state drives?/i, source, (count) => `${count} solid-state drives for data sanitization`);
  if (/containment panels|hot-aisle containment/i.test(source)) assets.push("hot-aisle containment panels and doors");
  if (/basket tray|fiber trough|under-floor cabling/i.test(source)) assets.push("basket tray, fiber trough, and under-floor cabling");
  return mergeUnique(assets).slice(0, 12);
}

function addAsset(assets, pattern, source, labelFor) {
  const match = pattern.exec(source);
  if (!match) return;
  assets.push(labelFor(numberFromQuantity(match[1] || match[0])));
}

function numberFromQuantity(value) {
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const normalized = String(value || "").toLowerCase().replace(/,/g, "");
  return words[normalized] || Number(normalized);
}

function scopeBulletsFromText(text) {
  const bullets = String(text || "").split("\n")
    .map((line) => line.trim().replace(/^\*\s+/, ""))
    .filter((line) => /^(remove|haul|final|prepare|recycle|remarket|dispose|provide|perform)\b/i.test(line));
  return bullets.slice(0, 8);
}

function attachmentHints(text) {
  const source = String(text || "");
  return {
    floorPlan: /floor plan|drawing|layout/i.test(source),
    equipmentList: /equipment inventory|inventory spreadsheet|asset list|equipment list/i.test(source),
    sitePhotos: /site photographs|site photos|photos|pictures|images/i.test(source),
    dockInstructions: /dock|freight elevator|loading/i.test(source),
    contractorRules: /contractor rules|facility rules/i.test(source),
    electricalMatrix: /electrical disconnect responsibility matrix|responsibility matrix/i.test(source)
  };
}

function accessHints(text) {
  const pieces = [];
  const hours = /(?:normal working hours|working hours|access hours)\s+(?:are\s+)?([^.\n]+)/i.exec(text)?.[1];
  if (hours) pieces.push(`Working hours: ${hours.trim()}`);
  if (/identification\s+48\s+hours/i.test(text)) pieces.push("Worker identification required 48 hours before arrival");
  if (/check in at security/i.test(text)) pieces.push("Daily security check-in required");
  if (/secured loading dock/i.test(text)) pieces.push("Secured loading dock available");
  const elevator = /freight elevator[^.\n]+/i.exec(text)?.[0];
  if (elevator) pieces.push(elevator.trim());
  if (/floor protection/i.test(text)) pieces.push("Floor protection required");
  return pieces.length ? pieces.join("; ") : null;
}

function dateNear(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return dateFrom(match[1] || match[0]);
  }
  return null;
}

function budgetCentsFrom(text) {
  const match = /\$\s*([\d,]+)(?:\.(\d{2}))?/.exec(text);
  if (!match) return null;
  return Number(`${match[1].replace(/,/g, "")}${match[2] || "00"}`);
}

function mergeUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values.flat().filter(Boolean)) {
    const cleaned = String(value).trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function normalizeMissing(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    key: String(item.key || item.requirement_key || `missing_${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    label: stringOr(item.label, "Missing requirement"),
    category: ["scope", "timeline", "access", "equipment", "commercial", "safety", "documentation"].includes(item.category) ? item.category : "scope",
    severity: ["low", "medium", "high", "blocking"].includes(item.severity) ? item.severity : "medium",
    reason: stringOr(item.reason, "Required before the project can be fully scoped.")
  })).slice(0, 10);
}

function equipmentText(extraction) {
  const assets = extraction.equipment.assets || [];
  if (extraction.equipment.rackCount && !assets.some((item) => /rack/i.test(item))) {
    assets.unshift(`${extraction.equipment.rackCount} racks`);
  }
  return assets.length ? assets.join(", ") : "Missing";
}

function channelToPreference(channel) {
  return ["email", "phone", "text"].includes(channel) ? channel : "unknown";
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nonEmptyArray(value, fallback) {
  return Array.isArray(value) && value.filter(Boolean).length ? value.filter(Boolean).slice(0, 8) : fallback;
}

function clampInt(value, min, max, fallback) {
  const next = Number.parseInt(value, 10);
  if (Number.isNaN(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

function integerOrNull(value) {
  const next = Number.parseInt(value, 10);
  return Number.isNaN(next) ? null : next;
}

function emailFrom(text) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] || null;
}

function phoneFrom(text) {
  return /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.exec(text)?.[0] || null;
}

function addressFrom(text) {
  return /\b\d{1,6}\s+[A-Z0-9][A-Z0-9.' -]{1,80}\s(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Parkway|Pkwy|Way|Highway|Hwy)(?:\s*,?\s+(?:Suite|Ste|Unit|Floor|Fl)\s*[A-Z0-9-]+)?\s*,?\s*[A-Z][A-Z.' -]{1,40}\s*,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.exec(text)?.[0]?.trim() || null;
}

function accessFrom(text) {
  if (/after hours/i.test(text)) return "After hours";
  if (/business hours/i.test(text)) return "Business hours";
  return null;
}

function dateFrom(text) {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return iso[0];
  const slash = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/(20\d{2}))?\b/.exec(text);
  if (slash) return dateStringFromParts(Number(slash[3]) || null, Number(slash[1]) - 1, Number(slash[2]));
  const names = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
    jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  const named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-3]?\d)(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?\b/i.exec(text);
  if (named) return dateStringFromParts(Number(named[3]) || null, names[named[1].toLowerCase()], Number(named[2]));
  return null;
}

function dateStringFromParts(explicitYear, monthIndex, day) {
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const reference = new Date();
  let year = explicitYear || reference.getFullYear();
  let date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return null;
  if (!explicitYear) {
    const today = new Date(Date.UTC(reference.getFullYear(), reference.getMonth(), reference.getDate()));
    if (date < today) {
      year += 1;
      date = new Date(Date.UTC(year, monthIndex, day));
    }
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function fileCategoryLabel(value) {
  return String(value || "source").replaceAll("_", " ");
}

function stageLabel(status) {
  return ({ new: "New", needs_info: "Needs info", estimating: "Estimating", site_visit: "Site visit", proposal: "Proposal", review: "Review", won: "Won", lost: "Lost", archived: "Archived" })[status] || String(status || "unknown").replaceAll("_", " ");
}

function scopeFor(serviceLabel, assets) {
  const detected = assets.length ? assets : ["identified equipment"];
  if (serviceLabel === "Data Center Decommissioning") {
    return ["Remove and recycle decommissioned data center equipment", "Perform cable abatement and site cleanup", `Validate handling plan for ${detected.join(", ")}`];
  }
  if (serviceLabel === "Cable Abatement") return ["Remove abandoned cable", "Coordinate access and ceiling work", "Recycle eligible copper/fiber material"];
  if (serviceLabel === "HVAC Removal") return ["Remove HVAC/CRAC units", "Confirm utility isolation", "Coordinate rigging and disposal"];
  return ["Confirm final scope", "Prepare labor and logistics estimate", "Document site constraints"];
}
