import type { KnowledgeScope } from "../knowledge/spaces";

let activeScope: KnowledgeScope = "all";

export function setToolKnowledgeScope(scope: KnowledgeScope) {
  activeScope = scope;
}

export function getToolKnowledgeScope(): KnowledgeScope {
  return activeScope;
}
