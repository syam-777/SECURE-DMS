import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./CaseEvidenceGraphPage.css";

const LAYER_ORDER = ["case", "document", "version", "entity"];

const NODE_WIDTH = { case: 190, document: 190, version: 92, entity: 190 };
const NODE_HEIGHT = { case: 58, document: 58, version: 40, entity: 54 };

const COLUMN_GAP = 64;
const ROW_GAP = 26;
const PAD_X = 24;
const PAD_Y = 44;
const MIN_HEIGHT = 220;

const ENTITY_COLORS = {
  people: "#7c3aed",
  organizations: "#2563eb",
  locations: "#0d9488",
  dates: "#d97706",
  caseReferenceNumbers: "#ea580c",
};

const FILTERS = [
  { key: "all", label: "All entities" },
  { key: "people", label: "People" },
  { key: "organizations", label: "Organizations" },
  { key: "locations", label: "Locations" },
  { key: "dates", label: "Dates" },
  { key: "caseReferenceNumbers", label: "Case References" },
];

function formatGroupName(group) {
  if (!group) {
    return "Entity";
  }
  return group
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

function fitLabel(value, max = 26) {
  const text = String(value == null ? "" : value);
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
}

function computeLayout(nodes) {
  const layers = { case: [], document: [], version: [], entity: [] };
  nodes.forEach((node) => {
    const type = LAYER_ORDER.includes(node.type) ? node.type : "entity";
    layers[type].push(node);
  });

  const colX = {};
  let cursor = PAD_X;
  LAYER_ORDER.forEach((type) => {
    colX[type] = cursor;
    cursor += NODE_WIDTH[type] + COLUMN_GAP;
  });
  const svgWidth = cursor - COLUMN_GAP + PAD_X;

  let neededMax = MIN_HEIGHT;
  LAYER_ORDER.forEach((type) => {
    const count = layers[type].length;
    if (count > 0) {
      const needed = count * (NODE_HEIGHT[type] + ROW_GAP) - ROW_GAP + 2 * PAD_Y;
      neededMax = Math.max(neededMax, needed);
    }
  });
  const svgHeight = neededMax;

  const positions = {};
  LAYER_ORDER.forEach((type) => {
    const items = layers[type];
    const shown = items.length;
    if (shown === 0) {
      return;
    }
    const needed = shown * (NODE_HEIGHT[type] + ROW_GAP) - ROW_GAP;
    const startY = (svgHeight - needed) / 2;
    items.forEach((node, index) => {
      positions[node.id] = {
        x: colX[type],
        y: startY + index * (NODE_HEIGHT[type] + ROW_GAP),
      };
    });
  });

  const counts = {
    case: layers.case.length,
    document: layers.document.length,
    version: layers.version.length,
    entity: layers.entity.length,
  };

  return { colX, positions, svgWidth, svgHeight, counts };
}

function LoadingView() {
  return (
    <div className="eg-skeleton-shelf" aria-busy="true" aria-label="Loading evidence graph">
      <div className="eg-skeleton eg-skeleton-banner" />
      <div className="eg-skeleton eg-skeleton-graph" />
    </div>
  );
}

function NoticeView({ title, children }) {
  return (
    <div className="eg-notice">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function StatChip({ value, label }) {
  return (
    <div className="eg-chip">
      <span className="eg-chip-value">{value}</span>
      <span className="eg-chip-label">{label}</span>
    </div>
  );
}

function EntityPanel({ node, onClose }) {
  const metadata = (node && node.metadata) || {};
  const group = metadata.group;
  const color = ENTITY_COLORS[group] || "#64748b";
  const documents = Array.isArray(metadata.documents) ? metadata.documents : [];
  const mentionCount = typeof metadata.mentionCount === "number" ? metadata.mentionCount : 0;

  return (
    <div className="eg-panel" role="complementary" aria-label="Entity details">
      <div className="eg-panel-header">
        <div className="eg-panel-title-row">
          <span
            className="eg-panel-dot"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <h3 className="eg-panel-title">{node ? node.label : ""}</h3>
        </div>
        <button
          type="button"
          className="eg-panel-close"
          onClick={onClose}
          aria-label="Close entity details"
        >
          {"\u00d7"}
        </button>
      </div>

      <span className="eg-panel-group">{formatGroupName(group)}</span>

      <p className="eg-panel-meta">
        Mentioned in {mentionCount} document version
        {mentionCount === 1 ? "" : "s"} in this case.
      </p>

      <div className="eg-panel-docs">
        <h4 className="eg-panel-docs-heading">Documents</h4>
        {documents.length === 0 ? (
          <p className="eg-panel-empty">No document memberships recorded.</p>
        ) : (
          documents.map((doc) => (
            <Link
              key={doc.documentId}
              className="eg-panel-doc"
              to={`/document-details/${doc.documentId}`}
            >
              <span className="eg-panel-doc-title">{doc.documentTitle}</span>
              <span className="eg-panel-doc-meta">
                Version{doc.versions.length > 1 ? "s" : ""}{" "}
                {doc.versions.join(", ")}
              </span>
            </Link>
          ))
        )}
      </div>

      <p className="eg-panel-note">
        This shows stored extraction membership only - not a suggested
        relationship between entities.
      </p>
    </div>
  );
}

function CaseEvidenceGraphPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState({ message: "", status: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedEntityId, setSelectedEntityId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadGraph = async () => {
      try {
        const result = await apiFetch(`/cases/${caseId}/evidence-graph`);
        if (cancelled) {
          return;
        }
        if (!result.success) {
          throw new Error(result.message || "Failed to load evidence graph");
        }
        setGraph({ nodes: result.nodes || [], edges: result.edges || [] });
        setError({ message: "", status: 0 });
        setSelectedEntityId(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError({
          message: err.message || "Failed to load evidence graph",
          status: err.status || 0,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadGraph();

    return () => {
      cancelled = true;
    };
  }, [caseId, reloadKey]);

  const filtered = useMemo(() => {
    if (!graph) {
      return null;
    }
    if (activeFilter === "all") {
      return graph;
    }
    const keepIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            node.type !== "entity" || node.metadata.group === activeFilter
        )
        .map((node) => node.id)
    );
    return {
      nodes: graph.nodes.filter((node) => keepIds.has(node.id)),
      edges: graph.edges.filter(
        (edge) => keepIds.has(edge.source) && keepIds.has(edge.target)
      ),
    };
  }, [graph, activeFilter]);

  const stats = useMemo(() => {
    if (!graph) {
      return { documents: 0, versions: 0, entities: 0, mentions: 0 };
    }
    return {
      documents: graph.nodes.filter((n) => n.type === "document").length,
      versions: graph.nodes.filter((n) => n.type === "version").length,
      entities: graph.nodes.filter((n) => n.type === "entity").length,
      mentions: graph.nodes
        .filter((n) => n.type === "entity")
        .reduce((total, n) => total + (Number(n.metadata.mentionCount) || 0), 0),
    };
  }, [graph]);

  const selectedEntity = useMemo(() => {
    if (!selectedEntityId || !filtered) {
      return null;
    }
    return filtered.nodes.find((node) => node.id === selectedEntityId) || null;
  }, [selectedEntityId, filtered]);

  const layout = useMemo(() => {
    return filtered && filtered.nodes.length > 0
      ? computeLayout(filtered.nodes)
      : null;
  }, [filtered]);

  const nodeById = useMemo(() => {
    const map = new Map();
    if (filtered) {
      filtered.nodes.forEach((node) => map.set(node.id, node));
    }
    return map;
  }, [filtered]);

  const handleRefresh = () => {
    if (loading || refreshing) {
      return;
    }
    setRefreshing(true);
    setReloadKey((key) => key + 1);
  };

  const handleRetry = () => {
    setLoading(true);
    setError({ message: "", status: 0 });
    setReloadKey((key) => key + 1);
  };

  const handleSelectFilter = (key) => {
    setActiveFilter(key);
    setSelectedEntityId(null);
  };

  const handleNodeClick = (node) => {
    if (node.type === "case") {
      navigate(`/case-details/${caseId}`);
      return;
    }
    if (node.type === "document") {
      navigate(`/document-details/${node.metadata.documentId}`);
      return;
    }
    if (node.type === "entity") {
      setSelectedEntityId((current) => (current === node.id ? null : node.id));
    }
  };

  let content;

  if (loading) {
    content = <LoadingView />;
  } else if (error.status === 401 || error.status === 403) {
    content = (
      <NoticeView title="No Access">
        <p>
          You do not have permission to view this case&apos;s evidence graph.
        </p>
        <Link className="eg-inline-button" to={`/case-details/${caseId}`}>
          Back to Case
        </Link>
      </NoticeView>
    );
  } else if (error.status === 404) {
    content = (
      <NoticeView title="Case Not Found">
        <p>
          No case was found with ID <strong>{caseId}</strong>.
        </p>
        <Link className="eg-inline-button" to="/cases">
          Back to Cases
        </Link>
      </NoticeView>
    );
  } else if (error.message) {
    content = (
      <NoticeView title="Unable to load the evidence graph">
        <p>{error.message}</p>
        <button type="button" className="eg-inline-button" onClick={handleRetry}>
          Retry
        </button>
      </NoticeView>
    );
  } else if (!layout || filtered.nodes.length === 1) {
    content = (
      <NoticeView title="No documents to map">
        <p>
          This case has no documents yet, so there is nothing to map in the
          evidence graph.
        </p>
        <Link className="eg-inline-button" to={`/case-details/${caseId}`}>
          Back to Case
        </Link>
      </NoticeView>
    );
  } else {
    content = (
      <div className="eg-split">
        <div className="eg-main">
          <div className="eg-toolbar">
            <div className="eg-filters" role="group" aria-label="Filter entities">
              {FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.key}
                  className={`eg-filter ${
                    activeFilter === filter.key ? "active" : ""
                  }`}
                  onClick={() => handleSelectFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="eg-refresh"
              onClick={handleRefresh}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="eg-graph-scroll">
            <svg
              className="eg-graph"
              viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
              role="img"
              aria-label={`Evidence graph for case with ${stats.documents} documents and ${stats.entities} entities`}
            >
              {LAYER_ORDER.map((type) => {
                const count = layout.counts[type];
                if (count === 0) {
                  return null;
                }
                const label = type === "case" ? "Case" : `${type[0].toUpperCase()}${type.slice(1)}s`;
                return (
                  <text
                    key={type}
                    className="eg-column-label"
                    x={layout.colX[type] + NODE_WIDTH[type] / 2}
                    y="20"
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                );
              })}

              {filtered.edges.map((edge, index) => {
                const sourceNode = nodeById.get(edge.source);
                const targetNode = nodeById.get(edge.target);
                const sourcePos = layout.positions[edge.source];
                const targetPos = layout.positions[edge.target];
                if (!sourceNode || !targetNode || !sourcePos || !targetPos) {
                  return null;
                }
                const sx = sourcePos.x + NODE_WIDTH[sourceNode.type];
                const sy = sourcePos.y + NODE_HEIGHT[sourceNode.type] / 2;
                const tx = targetPos.x;
                const ty = targetPos.y + NODE_HEIGHT[targetNode.type] / 2;
                const mid = (sx + tx) / 2;
                const stroke =
                  edge.type === "VERSION_TO_ENTITY"
                    ? ENTITY_COLORS[targetNode.metadata.group] || "#94a3b8"
                    : edge.type === "CASE_TO_DOCUMENT"
                    ? "#94a3b8"
                    : "#cbd5e1";
                return (
                  <path
                    key={`${edge.source}-${edge.target}-${index}`}
                    className="eg-edge"
                    d={`M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`}
                    stroke={stroke}
                  />
                );
              })}

              {filtered.nodes.map((node) => {
                const pos = layout.positions[node.id];
                if (!pos) {
                  return null;
                }
                const type = node.type;
                const width = NODE_WIDTH[type];
                const height = NODE_HEIGHT[type];
                const clickable =
                  type === "case" || type === "document" || type === "entity";
                const vertexProps = clickable
                  ? {
                      role: "button",
                      tabIndex: 0,
                      onClick: () => handleNodeClick(node),
                      onKeyDown: (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNodeClick(node);
                        }
                      },
                    }
                  : {};
                const labelText =
                  type === "version"
                    ? `v${node.metadata.versionNumber}`
                    : fitLabel(node.label);
                const titleText =
                  type === "version"
                    ? `Version ${node.metadata.versionNumber}`
                    : node.label;

                let rect;
                let textClass = "eg-node-label";

                if (type === "case") {
                  rect = (
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={width}
                      height={height}
                      rx="10"
                      className="eg-node eg-node-case"
                    />
                  );
                  textClass = "eg-node-label eg-node-label-case";
                } else if (type === "document") {
                  rect = (
                    <g>
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width={width}
                        height={height}
                        rx="10"
                        className="eg-node eg-node-document"
                      />
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width="6"
                        height={height}
                        rx="3"
                        className="eg-node-accent"
                      />
                    </g>
                  );
                } else if (type === "version") {
                  rect = (
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={width}
                      height={height}
                      rx="8"
                      className="eg-node eg-node-version"
                    />
                  );
                  textClass = "eg-node-label eg-node-label-version";
                } else {
                  const color = ENTITY_COLORS[node.metadata.group] || "#64748b";
                  rect = (
                    <g>
                      <rect
                        x={pos.x}
                        y={pos.y}
                        width={width}
                        height={height}
                        rx="10"
                        className="eg-node eg-node-entity"
                        stroke={color}
                      />
                      <circle
                        cx={pos.x + 16}
                        cy={pos.y + height / 2}
                        r="5"
                        fill={color}
                      />
                    </g>
                  );
                }

                return (
                  <g
                    key={node.id}
                    className={`eg-vertex ${clickable ? "eg-vertex-clickable" : ""}`}
                    aria-label={
                      type === "case"
                        ? `Case ${node.label}`
                        : type === "document"
                        ? `Document ${node.label}`
                        : type === "entity"
                        ? `${formatGroupName(node.metadata.group)} ${node.label}`
                        : labelText
                    }
                    {...vertexProps}
                  >
                    {rect}
                    <text
                      className={textClass}
                      x={pos.x + width / 2}
                      y={pos.y + height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {labelText}
                    </text>
                    {type === "case" && (
                      <title>{node.label}</title>
                    )}
                    {type === "document" && (
                      <title>{node.metadata.documentTitle || node.label}</title>
                    )}
                    {type === "entity" ? (
                      <title>{titleText}</title>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="eg-legend" aria-label="Graph legend">
            <div className="eg-legend-item">
              <span className="eg-legend-swatch eg-legend-swatch-case" />
              Case
            </div>
            <div className="eg-legend-item">
              <span className="eg-legend-swatch eg-legend-swatch-document" />
              Document
            </div>
            <div className="eg-legend-item">
              <span className="eg-legend-swatch eg-legend-swatch-version" />
              Version
            </div>
            {FILTERS.filter((f) => f.key !== "all").map((f) => (
              <div className="eg-legend-item" key={f.key}>
                <span
                  className="eg-legend-swatch"
                  style={{ backgroundColor: ENTITY_COLORS[f.key] }}
                />
                {f.label.replace(" entities", "")}
              </div>
            ))}
          </div>
        </div>

        {selectedEntity ? (
          <EntityPanel node={selectedEntity} onClose={() => setSelectedEntityId(null)} />
        ) : (
          <aside className="eg-panel eg-panel-placeholder">
            <p>
              Select an entity node to see which document versions in this case
              mention it.
            </p>
          </aside>
        )}
      </div>
    );
  }

  return (
    <div className="evidence-graph-page">
      <AppLayout>
        <div className="eg-heading">
          <div className="eg-heading-row">
            <div>
              <h1 className="eg-page-title">Evidence Graph</h1>
              <p className="eg-page-description">
                {graph
                  ? `Case-to-document-to-entity map: ${stats.documents} documents, ${stats.versions} versions, ${stats.entities} entities.`
                  : "Visual map of how case documents link to extracted entities."}
              </p>
            </div>
            <div className="eg-heading-actions">
              <Link className="eg-back-button" to={`/case-details/${caseId}`}>
                {"\u2190"} Back to Case
              </Link>
            </div>
          </div>
        </div>

        <div className="eg-chips">
          <StatChip value={stats.documents} label="Documents" />
          <StatChip value={stats.versions} label="Versions" />
          <StatChip value={stats.entities} label="Entities" />
          <StatChip value={stats.mentions} label="Entity Mentions" />
        </div>

        {content}
      </AppLayout>
    </div>
  );
}

export default CaseEvidenceGraphPage;