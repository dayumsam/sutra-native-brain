"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  useNodesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodeDrag,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import {
  NODES,
  EDGES,
  SATELLITE_NODES,
  SATELLITE_EDGES,
  DOMAIN_META,
  type Domain,
} from "@/lib/demo-data";

type EntityData = {
  label: string;
  domain: Domain;
  state: "idle" | "active" | "dim";
  satellite: boolean;
  size: number;
  hovered?: boolean;
  fields?: [string, string][];
};

type EntityNode = Node<EntityData, "entity">;

const hiddenHandle: React.CSSProperties = {
  opacity: 0,
  left: "50%",
  top: "50%",
  transform: "translate(-50%,-50%)",
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  pointerEvents: "none",
};

function NodeTooltip({ label, fields, color }: { label: string; fields: [string, string][]; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: 188,
        background: "#23203a",
        border: "1px solid #413c62",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        pointerEvents: "none",
        zIndex: 2147483647,
      }}
    >
      <div
        style={{
          borderBottom: "1px solid #413c62",
          padding: "5px 10px 4px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "#e8e5f6", lineHeight: 1.3 }}>
          {label}
        </span>
      </div>
      <div style={{ padding: "4px 0 6px" }}>
        {fields.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr",
              gap: 4,
              padding: "2px 10px",
              fontSize: 10,
              lineHeight: 1.45,
            }}
          >
            <span style={{ color: "#7a738f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
            <span style={{ color: "#c8c2e0", fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntityNodeView({ data }: NodeProps<EntityNode>) {
  const color = DOMAIN_META[data.domain].color;
  const active = data.state === "active";
  const dim = data.state === "dim";
  const hovered = !!data.hovered;
  const size = data.size;
  const product = data.domain === "product" && !data.satellite;
  const showTooltip = hovered && !data.satellite && data.fields && data.fields.length > 0;

  return (
    <div
      className="relative transition-opacity duration-300"
      style={{ width: size, height: size, opacity: dim ? (data.satellite ? 0.14 : 0.3) : 1 }}
    >
      <div
        className="h-full w-full rounded-full transition-shadow duration-300"
        style={{
          background: color,
          boxShadow: active
            ? `0 0 0 4px ${color}38, 0 0 18px ${color}cc`
            : hovered
              ? `0 0 0 3px ${color}50, 0 0 10px ${color}88`
              : product
                ? `0 0 0 3px ${color}28, 0 0 14px ${color}77`
                : `inset 0 0 0 1.5px rgba(8, 6, 20, 0.35)`,
          cursor: data.satellite ? "default" : "pointer",
        }}
      />
      {(!data.satellite || active) && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center"
          style={{
            top: size + 5,
            width: "max-content",
            maxWidth: 120,
            fontSize: data.satellite ? 9 : product ? 11 : 10,
            lineHeight: 1.25,
            fontWeight: active || hovered || product ? 600 : 400,
            color: active || hovered ? "#f4f3fb" : product ? "#c9c5e4" : "#8f8bb0",
            textShadow: "0 1px 4px rgba(10, 8, 22, 0.9)",
          }}
        >
          {data.label}
        </div>
      )}
      {showTooltip && (
        <NodeTooltip label={data.label} fields={data.fields!} color={color} />
      )}
      <Handle type="target" position={Position.Left} style={hiddenHandle} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={hiddenHandle} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { entity: EntityNodeView };

const ALL_EDGES = [...EDGES, ...SATELLITE_EDGES];

// Node size scales with degree so heavily-connected hubs read as hubs
const DEGREE = new Map<string, number>();
ALL_EDGES.forEach((e) => {
  DEGREE.set(e.from, (DEGREE.get(e.from) ?? 0) + 1);
  DEGREE.set(e.to, (DEGREE.get(e.to) ?? 0) + 1);
});
const sizeFor = (id: string) => Math.round(10 + Math.sqrt(DEGREE.get(id) ?? 1) * 2.6);

const initialNodes: EntityNode[] = [
  ...NODES.map((n) => ({
    id: n.id,
    type: "entity" as const,
    position: { x: n.x, y: n.y },
    data: {
      label: n.label,
      domain: n.domain,
      state: "idle" as const,
      satellite: false,
      // product nodes anchor the graph — render them noticeably larger
      size: sizeFor(n.id) + (n.domain === "product" ? 6 : 0),
      fields: n.fields,
    },
  })),
  ...SATELLITE_NODES.map((n) => ({
    id: n.id,
    type: "entity" as const,
    position: { x: n.x, y: n.y },
    data: { label: n.label, domain: n.domain, state: "idle" as const, satellite: true, size: 9 },
  })),
];

type SimNode = SimulationNodeDatum & {
  id: string;
  homeX: number;
  homeY: number;
  satellite: boolean;
  size: number;
};

type SimLink = SimulationLinkDatum<SimNode>;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type Props = {
  activeNodeIds: string[];
  /** All node ids in the running workflow — the camera frames these. */
  focusNodeIds: string[];
  hasRun: boolean;
};

function CanvasInner({ activeNodeIds, focusNodeIds, hasRun }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const { fitView } = useReactFlow();
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const wrapRef = useRef<HTMLDivElement>(null);

  // fluid force layout: link springs, node repulsion, and gravity back toward
  // each node's curated home position
  useEffect(() => {
    const simNodes: SimNode[] = initialNodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      homeX: n.position.x,
      homeY: n.position.y,
      satellite: n.data.satellite,
      size: n.data.size,
    }));
    const byId = new Map(simNodes.map((s) => [s.id, s]));
    simNodesRef.current = byId;

    const links: SimLink[] = ALL_EDGES.map((e) => ({ source: e.from, target: e.to }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) =>
            (l.source as SimNode).satellite || (l.target as SimNode).satellite ? 64 : 120
          )
          .strength(0.25)
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((d) => (d.satellite ? -55 : -220))
          .distanceMax(320)
      )
      .force("homeX", forceX<SimNode>((d) => d.homeX).strength(0.05))
      .force("homeY", forceY<SimNode>((d) => d.homeY).strength(0.05))
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((d) => (d.satellite ? 13 : 12 + d.size))
          .strength(0.8)
      )
      .alpha(0.6)
      .alphaDecay(0.018)
      .velocityDecay(0.35)
      .on("tick", () => {
        setNodes((ns) =>
          ns.map((n) => {
            const s = byId.get(n.id);
            if (!s || n.dragging) return n;
            const x = s.x ?? n.position.x;
            const y = s.y ?? n.position.y;
            if (x === n.position.x && y === n.position.y) return n;
            return { ...n, position: { x, y } };
          })
        );
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [setNodes]);

  const pinNode = useCallback((node: Node) => {
    const s = simNodesRef.current.get(node.id);
    if (!s) return;
    s.fx = node.position.x;
    s.fy = node.position.y;
  }, []);

  const onNodeDragStart = useCallback<OnNodeDrag<EntityNode>>(
    (_, node) => {
      pinNode(node);
      simRef.current?.alphaTarget(0.3).restart();
    },
    [pinNode]
  );

  const onNodeDrag = useCallback<OnNodeDrag<EntityNode>>((_, node) => pinNode(node), [pinNode]);

  const onNodeDragStop = useCallback<OnNodeDrag<EntityNode>>((_, node) => {
    const s = simNodesRef.current.get(node.id);
    if (s) {
      s.fx = null;
      s.fy = null;
    }
    simRef.current?.alphaTarget(0);
  }, []);

  const onNodeMouseEnter = useCallback<NodeMouseHandler<EntityNode>>((_, node) => {
    if (node.data.satellite) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === node.id
          ? { ...n, zIndex: 2147483647, data: { ...n.data, hovered: true } }
          : n
      )
    );
  }, [setNodes]);

  const onNodeMouseLeave = useCallback<NodeMouseHandler<EntityNode>>((_, node) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === node.id
          ? { ...n, zIndex: 0, data: { ...n.data, hovered: false } }
          : n
      )
    );
  }, [setNodes]);

  // update highlight state without disturbing user-dragged positions
  useEffect(() => {
    const active = new Set(activeNodeIds);
    setNodes((ns) =>
      ns.map((n) => {
        const state: EntityData["state"] = active.has(n.id)
          ? "active"
          : hasRun
            ? "dim"
            : "idle";
        return n.data.state === state ? n : { ...n, data: { ...n.data, state } };
      })
    );
  }, [activeNodeIds, hasRun, setNodes]);

  // camera target: the nodes read so far while running, the whole workflow
  // neighborhood at run start, or the full graph when idle
  const fitTarget = activeNodeIds.length > 0 ? activeNodeIds : focusNodeIds;
  const fitTargetRef = useRef<string[]>(fitTarget);
  useEffect(() => {
    fitTargetRef.current = fitTarget;
  });

  const applyFit = useCallback(
    (duration: number) => {
      const ids = fitTargetRef.current;
      if (ids.length > 0) {
        fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.25,
          duration,
          maxZoom: 1.4,
          ease: easeInOutCubic,
          interpolate: "smooth",
        });
      } else {
        fitView({ padding: 0.08, duration, ease: easeInOutCubic, interpolate: "smooth" });
      }
    },
    [fitView]
  );

  // follow the active nodes as each retrieval step reveals; zoom out on reset
  const fitKey = fitTarget.join(",");
  useEffect(() => {
    applyFit(1100);
  }, [fitKey, applyFit]);

  // re-align the camera when the canvas resizes (window resize or the
  // response panel widening), debounced until the resize settles
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => applyFit(700), 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [applyFit]);

  const edges: Edge[] = useMemo(() => {
    const active = new Set(activeNodeIds);
    return ALL_EDGES.map((edge) => {
      const isActive = active.has(edge.from) && active.has(edge.to);
      // satellite edges are decoration — runs never traverse them, keep them faint
      const satellite = edge.id.startsWith("se_");
      const stroke = isActive
        ? "var(--canvas-active)"
        : satellite
          ? hasRun
            ? "#272440"
            : "var(--canvas-edge-dim)"
          : hasRun
            ? "var(--canvas-edge-dim)"
            : "var(--canvas-edge)";
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "straight",
        animated: isActive,
        markerEnd: satellite
          ? undefined
          : { type: MarkerType.ArrowClosed, width: 11, height: 11, color: stroke },
        style: { stroke, strokeWidth: isActive ? 1.6 : satellite ? 0.8 : 1 },
      };
    });
  }, [activeNodeIds, hasRun]);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.25}
        maxZoom={2.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        style={{ background: "var(--canvas)" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#2c2945" bgColor="var(--canvas)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
