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

const INTAKE_DEVELOPER_PROMPT = `You are DCDecom's senior intake estimator. Convert customer emails, call notes, text messages, manual notes, and extracted document or photo text into complete, structured inquiry data.

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

export async function analyzeIntake(env, { rawText, sourceChannel = "manual", subject = "", sender = "", attachmentText = "" }) {
  const normalizedText = String(rawText || "").trim();
  if (normalizedText.length < 12) {
    return {
      mode: "fallback",
      model: "local-rules",
      extraction: fallbackExtraction(normalizedText, sourceChannel),
      error: "Intake text was too short for live AI analysis."
    };
  }

  if (!env?.OPENAI_API_KEY) {
    return {
      mode: "fallback",
      model: "local-rules",
      extraction: fallbackExtraction(normalizedText, sourceChannel),
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
      developerText: INTAKE_DEVELOPER_PROMPT,
      userText: [
        `Source channel: ${sourceChannel}`,
        subject ? `Subject: ${subject}` : null,
        sender ? `Sender: ${sender}` : null,
        "",
        "Customer communication:",
        normalizedText,
        attachmentText ? `\nExtracted attachment or OCR text:\n${String(attachmentText).trim()}` : null
      ].filter((value) => value !== null).join("\n")
    });
    return {
      mode: "live",
      model,
      latencyMs: Date.now() - started,
      extraction: normalizeExtraction(parsed, sourceChannel),
      rawResponseId: data.id
    };
  } catch (error) {
    return {
      mode: "fallback",
      model,
      latencyMs: Date.now() - started,
      extraction: fallbackExtraction(normalizedText, sourceChannel),
      error: error.message
    };
  }
}

export async function generateWorkProduct(env, { type, inquiry, fields = [], missing = [], summaries = [], documents = [], tone = "Professional" }) {
  const normalizedType = normalizeWorkProductType(type);
  const fallback = () => fallbackWorkProduct({ type: normalizedType, inquiry, fields, missing, summaries, tone });
  if (!env?.OPENAI_API_KEY) {
    return { mode: "fallback", model: "local-rules", product: fallback(), error: "OPENAI_API_KEY is not configured." };
  }
  const started = Date.now();
  const model = env.OPENAI_MODEL || "gpt-5.5";
  try {
    const { parsed, data } = await callOpenAiJson(env, {
      model,
      schemaName: "dcdcom_work_product",
      schema: WORK_PRODUCT_SCHEMA,
      developerText: [
        "You are DCDecom's senior estimator and customer success drafter.",
        "Generate only practical, customer-ready work product content for data center decommissioning workflows.",
        "Do not invent confirmed facts. Surface assumptions and approval risks clearly.",
        "Use concise professional language suitable for a mobile operations workflow."
      ].join(" "),
      userText: JSON.stringify({
        requestedType: normalizedType,
        tone,
        inquiry,
        extractedFields: fields,
        missingRequirements: missing,
        existingSummaries: summaries,
        existingDocuments: documents
      }, null, 2)
    });
    return {
      mode: "live",
      model,
      latencyMs: Date.now() - started,
      product: normalizeWorkProduct(parsed, normalizedType, inquiry),
      rawResponseId: data.id
    };
  } catch (error) {
    return {
      mode: "fallback",
      model,
      latencyMs: Date.now() - started,
      product: fallback(),
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

async function callOpenAiJson(env, { model, schemaName, schema, developerText, userText }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
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
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed with ${response.status}`);
  }
  return { parsed: parseResponseJson(data), data };
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

function fallbackWorkProduct({ type, inquiry, fields, missing, summaries, tone }) {
  const field = (key) => fields.find((item) => item.field_key === key)?.value_text;
  const missingLabels = missing.map((item) => item.label);
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
      body: `Assumes normal site access, customer-provided approvals, and no hidden hazardous or energized conditions. Missing items: ${missingLabels.join(", ") || "none identified"}.`
    },
    {
      key: "deliverables",
      title: "Deliverables",
      body: "Deliverables include project plan, field checklist, removal/recycling documentation, and closeout summary."
    }
  ];
  const bodyByType = {
    follow_up_email: [
      `Hi ${inquiry.contact_name || "there"},`,
      "",
      `Thank you for reaching out about ${inquiry.title}. ${summary}`,
      "",
      missingLabels.length
        ? `To prepare an accurate estimate, could you confirm: ${missingLabels.join("; ")}?`
        : "We have enough to begin estimating and would recommend confirming site access before scheduling.",
      "",
      "We can also schedule a quick site review to validate scope and reduce proposal risk.",
      "",
      "Best regards,",
      "DCDecom Team"
    ].join("\n"),
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
    subject: type === "follow_up_email" ? `Quick follow-up on ${inquiry.title}` : null,
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

function normalizeWorkProductType(type) {
  const normalized = String(type || "follow_up_email").toLowerCase();
  if (["follow_up_email", "proposal", "scope_of_work", "site_checklist", "estimate"].includes(normalized)) return normalized;
  return "follow_up_email";
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

function fallbackExtraction(text, sourceChannel) {
  const lower = text.toLowerCase();
  const companyName = /ntt data/i.test(text) ? "NTT Data" : /cushman/i.test(text) ? "Cushman & Wakefield" : /digital realty/i.test(text) ? "Digital Realty" : /equinix/i.test(text) ? "Equinix" : "Unknown Company";
  const contactName = /(?:spoke with|from|contact is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/.exec(text)?.[1] || (/tom/i.test(text) ? "Tom" : /michael/i.test(text) ? "Michael" : "Unknown Contact");
  const location = /ashburn/i.test(text) ? ["Ashburn", "VA"] : /phoenix/i.test(text) ? ["Phoenix", "AZ"] : /washington|dc/i.test(text) ? ["Washington", "DC"] : /chicago/i.test(text) ? ["Chicago", "IL"] : [null, null];
  const serviceLabel = lower.includes("hvac") && !lower.includes("data center") ? "HVAC Removal" : lower.includes("cable") && !lower.includes("data center") ? "Cable Abatement" : lower.includes("electrical") && !lower.includes("data center") ? "Electrical Decommissioning" : "Data Center Decommissioning";
  const rackMatch = /(\d+)\s*(?:racks?|cabinets?)/i.exec(text);
  const missing = [];
  if (!/square|sq\.?\s*ft|suite size/i.test(text)) missing.push(["square_footage", "Square footage / suite size", "scope", "high", "Sizing is needed for labor and logistics assumptions."]);
  if (!rackMatch && /rack|cabinet|data center/i.test(text)) missing.push(["rack_count", "Number of racks / cabinets", "equipment", "high", "Rack count drives labor, recycling, and trucking."]);
  if (!/access|after hours|business hours|badge|escort/i.test(text)) missing.push(["access_hours", "Site access hours or restrictions", "access", "high", "Crew scheduling depends on access windows."]);
  if (!/floor plan|drawing|plan/i.test(text)) missing.push(["floor_plan", "Floor plan or site drawings", "documentation", "medium", "Drawings reduce site visit and proposal risk."]);
  if (!/data destruction|drive|media|wipe|shred/i.test(text)) missing.push(["data_destruction", "Data destruction requirements", "scope", "medium", "Media handling changes chain-of-custody and cost."]);
  if (!/disconnect|utility|shutoff|electrical/i.test(text)) missing.push(["electrical_disconnect", "Electrical disconnect responsibility", "safety", "high", "Electrical responsibility must be known before scope approval."]);

  const confidence = Math.max(48, 92 - missing.length * 5 - (companyName === "Unknown Company" ? 12 : 0));
  const lowCents = serviceLabel === "Data Center Decommissioning" ? 2500000 : serviceLabel === "Cable Abatement" ? 800000 : 1200000;
  const highCents = serviceLabel === "Data Center Decommissioning" ? 4500000 : serviceLabel === "Cable Abatement" ? 1400000 : 2800000;
  const assets = [
    rackMatch ? `${rackMatch[1]} racks` : null,
    /hvac|crac|cooling/i.test(text) ? "HVAC units" : null,
    /cable|fiber|copper/i.test(text) ? "Cable" : null,
    /ups|battery/i.test(text) ? "UPS/batteries" : null
  ].filter(Boolean);

  return normalizeExtraction({
    company: { name: companyName, website: null, industry: /data center|rack|cabinet/i.test(text) ? "Data Centers" : null },
    contact: { fullName: contactName, email: emailFrom(text), phone: phoneFrom(text), preferredChannel: channelToPreference(sourceChannel) },
    site: { name: companyName === "Unknown Company" ? "Customer Site" : `${companyName} Site`, fullAddress: addressFrom(text), city: location[0], region: location[1], country: "US", siteType: /data center|rack|cabinet/i.test(text) ? "data_center" : "unknown", accessNotes: accessFrom(text) },
    service: {
      type: SERVICE_TYPES[serviceLabel] || "other",
      label: serviceLabel,
      scopeBullets: scopeFor(serviceLabel, assets)
    },
    timeline: { leaseEndDate: dateFrom(text), requestedDueDate: null, urgencyReason: /lease|closing|urgent|asap/i.test(text) ? "Customer mentioned lease/closure timing." : null },
    equipment: { rackCount: rackMatch ? Number(rackMatch[1]) : null, assets, dataDestructionMentioned: /data destruction|drive|media|wipe|shred/i.test(text), electricalDisconnectMentioned: /disconnect|utility|shutoff|electrical/i.test(text) },
    commercial: { budgetMentioned: /\$|budget|not to exceed/i.test(text), decisionMakerKnown: /director|manager|owner|vp/i.test(text), proposalRequested: /proposal|quote|estimate/i.test(text) },
    missingRequirements: missing.map(([key, label, category, severity, reason]) => ({ key, label, category, severity, reason })),
    summary: `Customer communication appears to request ${serviceLabel.toLowerCase()}${location[0] ? ` in ${location[0]}, ${location[1]}` : ""}. ${missing.length ? "Several scope details need confirmation before final pricing." : "The request has enough detail for estimating review."}`,
    priority: /urgent|asap|lease|closing/i.test(text) ? "high" : "medium",
    workload: /data center|40 racks|hvac|electrical/i.test(text) ? "medium" : "low",
    confidenceScore: confidence,
    estimateRange: { lowCents, highCents, rationale: "Fallback range based on service type and detected equipment signals." },
    nextBestActions: ["Send missing-info follow-up", "Request site photos or floor plan", "Prepare site visit checklist"],
    followUpQuestions: missing.map(([, label]) => `Can you confirm ${label.toLowerCase()}?`)
  }, sourceChannel);
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
  const jul = /july\s+(15|31)|jul\.?\s+(15|31)/i.exec(text);
  if (jul) return `2025-07-${jul[1] || jul[2]}`;
  return null;
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
