export const state = {
  screen: "today",
  history: [],
  selectedId: "ntt",
  tone: "Professional",
  emailEditable: false,
  proposalTab: "Scope",
  savedNotice: "",
  inquiryTab: "Call Notes",
  pipelineFilter: "New",
  searchQuery: "",
  modal: null,
  expandedSummary: false,
  draftVersion: 0,
  includeOptions: {
    missing: true,
    visit: true,
    overview: true,
    timeline: false,
    photos: true,
    budget: false
  },
  checklist: {
    access: false,
    photos: false,
    inventory: false,
    utilities: false,
    security: false
  },
  activity: [
    "AI extracted NTT Data inquiry from call notes",
    "Follow-up email draft generated for missing scope details",
    "Proposal draft prepared for review"
  ],
  inputText: `Spoke with Tom from NTT Data.
They are closing a data center in Ashburn, VA.
Need full decommissioning including racks,
cable, and HVAC units.
Lease end date is July 15.
They have approx. 40 racks.
Need proposal and site visit.`
};
