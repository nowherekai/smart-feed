import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Source {
  id: string;
  type: "rss-source";
  identifier: string;
  title: string;
  status: "active" | "paused" | "blocked";
  weight: number;
}

export interface ContentItem {
  id: string;
  source_id: string;
  title: string;
  author?: string;
  cleaned_md: string;
  original_url: string;
  published_at: string;
  fetched_at: string;
}

export interface AnalysisRecord {
  id: string;
  content_id: string;
  category: string[];
  value_score: number;
  summary: {
    oneline: string;
    points: string[];
    reason: string;
  };
  evidence_snippet: string;
  source_name: string;
}

export interface Digest {
  id: string;
  date: string;
  items: AnalysisRecord[];
}

interface FeedState {
  sources: Source[];
  contentItems: ContentItem[];
  analysisRecords: AnalysisRecord[];
  digests: Digest[];
  mockMode: boolean;

  addSource: (url: string, title: string) => void;
  removeSource: (id: string) => void;
  toggleSourceStatus: (id: string) => void;
  setMockMode: (mode: boolean) => void;
}

const MOCK_SOURCES: Source[] = [
  {
    id: "s1",
    type: "rss-source",
    identifier: "https://techcrunch.com/feed/",
    title: "TechCrunch",
    status: "active",
    weight: 1.0,
  },
  {
    id: "s2",
    type: "rss-source",
    identifier: "https://www.theverge.com/rss/index.xml",
    title: "The Verge",
    status: "active",
    weight: 1.0,
  },
  {
    id: "s3",
    type: "rss-source",
    identifier: "https://www.wired.com/feed/rss",
    title: "Wired",
    status: "active",
    weight: 1.0,
  },
  {
    id: "s4",
    type: "rss-source",
    identifier: "https://news.ycombinator.com/rss",
    title: "Hacker News",
    status: "active",
    weight: 1.0,
  },
  {
    id: "s5",
    type: "rss-source",
    identifier: "https://css-tricks.com/feed/",
    title: "CSS-Tricks",
    status: "paused",
    weight: 1.0,
  },
];

const MOCK_ANALYSIS: AnalysisRecord[] = [
  {
    id: "a1",
    content_id: "c1",
    category: ["AI", "Tech"],
    value_score: 9.2,
    source_name: "TechCrunch",
    summary: {
      oneline: "OpenAI announces GPT-5 with unprecedented reasoning capabilities.",
      points: [
        "Significant improvements in logical deduction and complex problem solving.",
        "New multimodal features allowing real-time video processing.",
        "Enterprise-grade security and privacy controls included at launch.",
      ],
      reason: "This represents a major leap in LLM capabilities that will redefine software development.",
    },
    evidence_snippet:
      "...the model demonstrated a 40% improvement on the hardest reasoning benchmarks compared to its predecessor...",
  },
  {
    id: "a2",
    content_id: "c2",
    category: ["Space", "Science"],
    value_score: 8.5,
    source_name: "The Verge",
    summary: {
      oneline: "SpaceX successfully lands Starship on Mars in historic milestone.",
      points: [
        "Uncrewed mission confirms landing site stability.",
        "In-situ resource utilization tests show promising results for oxygen production.",
        "NASA confirms partnership for upcoming crewed missions.",
      ],
      reason: "The first successful landing of a heavy-lift vehicle on Mars paves the way for human colonization.",
    },
    evidence_snippet: "...telemetry confirmed a soft touchdown at Jezero Crater at 14:30 UTC...",
  },
  {
    id: "a3",
    content_id: "c3",
    category: ["Design", "UX"],
    value_score: 7.8,
    source_name: "Wired",
    summary: {
      oneline: "Apple Vision Pro 2 rumored to feature lighter design and better battery.",
      points: [
        "Weight reduced by 20% using new magnesium alloy.",
        "External battery pack now supports 4 hours of continuous use.",
        'New "AirDisplay" feature allows seamless Mac integration.',
      ],
      reason: "Addressing the primary complaints of the first generation could make spatial computing mainstream.",
    },
    evidence_snippet: "...supply chain reports suggest a focus on ergonomics and long-term wearability...",
  },
];

export const useFeedStore = create<FeedState>()(
  persist(
    (set) => ({
      sources: MOCK_SOURCES,
      contentItems: [],
      analysisRecords: MOCK_ANALYSIS,
      digests: [{ id: "d1", date: new Date().toISOString().split("T")[0] ?? "", items: MOCK_ANALYSIS }],
      mockMode: true,

      addSource: (url, title) =>
        set((state) => ({
          sources: [
            ...state.sources,
            {
              id: uuidv4(),
              type: "rss-source",
              identifier: url,
              title: title,
              status: "active",
              weight: 1.0,
            },
          ],
        })),

      removeSource: (id) =>
        set((state) => ({
          sources: state.sources.filter((s) => s.id !== id),
        })),

      toggleSourceStatus: (id) =>
        set((state) => ({
          sources: state.sources.map((s) =>
            s.id === id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s,
          ),
        })),

      setMockMode: (mode) => set({ mockMode: mode }),
    }),
    {
      name: "smart-feed-storage",
    },
  ),
);
