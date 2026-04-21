export type SeoGraphNodeType = "homepage" | "directory" | "location" | "company" | "role";

export type SeoGraphNode = {
  id: string;
  type: SeoGraphNodeType;
};

export type SeoGraphEdge = {
  from: string;
  to: string;
};

export type SeoGraphValidation = {
  orphanNodes: string[];
  oneWayEdges: Array<{ from: string; to: string }>;
  weakClusters: string[][];
  unreachableWithin3Clicks: string[];
  distanceFromHome: Record<string, number>;
};

function buildAdjacency(nodes: SeoGraphNode[], edges: SeoGraphEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
    reverse.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from)?.add(edge.to);
    reverse.get(edge.to)?.add(edge.from);
  }

  return { adjacency, reverse };
}

function bfsDistances(start: string, adjacency: Map<string, Set<string>>) {
  const distances = new Map<string, number>();
  if (!adjacency.has(start)) return distances;

  const queue: string[] = [start];
  distances.set(start, 0);

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const currentDistance = distances.get(current) ?? 0;
    const neighbors = adjacency.get(current) || new Set();
    for (const next of neighbors) {
      if (distances.has(next)) continue;
      distances.set(next, currentDistance + 1);
      queue.push(next);
    }
  }

  return distances;
}

function toUndirectedAdjacency(
  nodes: SeoGraphNode[],
  edges: SeoGraphEdge[]
): Map<string, Set<string>> {
  const undirected = new Map<string, Set<string>>();
  for (const node of nodes) undirected.set(node.id, new Set());
  for (const edge of edges) {
    if (!undirected.has(edge.from) || !undirected.has(edge.to)) continue;
    undirected.get(edge.from)?.add(edge.to);
    undirected.get(edge.to)?.add(edge.from);
  }
  return undirected;
}

function connectedComponents(undirected: Map<string, Set<string>>) {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of undirected.keys()) {
    if (visited.has(nodeId)) continue;
    const queue = [nodeId];
    const cluster: string[] = [];
    visited.add(nodeId);
    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      cluster.push(current);
      for (const neighbor of undirected.get(current) || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(cluster.sort((a, b) => a.localeCompare(b)));
  }

  return components;
}

export function validateSeoGraph(
  nodes: SeoGraphNode[],
  edges: SeoGraphEdge[],
  homepageId = "/"
): SeoGraphValidation {
  const { adjacency, reverse } = buildAdjacency(nodes, edges);

  const orphanNodes = nodes
    .map((n) => n.id)
    .filter((id) => (adjacency.get(id)?.size || 0) === 0 && (reverse.get(id)?.size || 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  const edgeSet = new Set(edges.map((edge) => `${edge.from}=>${edge.to}`));
  const oneWayEdges: Array<{ from: string; to: string }> = [];
  for (const edge of edges) {
    const reverseKey = `${edge.to}=>${edge.from}`;
    if (!edgeSet.has(reverseKey)) {
      oneWayEdges.push({ from: edge.from, to: edge.to });
    }
  }

  const undirected = toUndirectedAdjacency(nodes, edges);
  const components = connectedComponents(undirected);
  const weakClusters = components.filter((cluster) => cluster.length <= 2);

  const distances = bfsDistances(homepageId, adjacency);
  const distanceFromHome: Record<string, number> = {};
  for (const node of nodes) {
    const d = distances.get(node.id);
    distanceFromHome[node.id] = Number.isFinite(d) ? (d as number) : Number.POSITIVE_INFINITY;
  }

  const unreachableWithin3Clicks = nodes
    .map((n) => n.id)
    .filter((id) => !Number.isFinite(distanceFromHome[id]) || distanceFromHome[id] > 3)
    .sort((a, b) => a.localeCompare(b));

  return {
    orphanNodes,
    oneWayEdges,
    weakClusters,
    unreachableWithin3Clicks,
    distanceFromHome,
  };
}
