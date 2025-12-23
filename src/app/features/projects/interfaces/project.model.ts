export enum ProjectSessionVisibility {
  PROJECT_ALL = "project_all",
  SESSION_OWNER = "session_owner"
}

export interface ProjectSessionDto {
  created_on: string,
  session_id: string,
  session_owner: string
  session_visibility: ProjectSessionVisibility,
  user_role: Role
  session_name?: string
}

export interface ProjectDto {
  client_id: string;
  name: string;
  created_on: string;
  owner: string;
  project_id: string;
  roles: string[];
}

export interface ProjectArtifactsDataDto {
  artifact_hash: string;
  artifact_id: string;
  artifact_name: string;
  artifact_size: number;
  artifact_type: string;
  created_by: string;
  created_on: string;
  data_reference: DataRefence;
  source_id: string;
}

export enum DataRefence {
  FILE = 'file',
  QUERY_STRING = "query_string",
  EMBEDDINGS = "embeddings",
  COLLECTION = "collection",
  FILTER_DOCUMENT_PUBLICATION_DATETIME = "filter_document_publication_datetime",
  CONTEXT = "context",
  USER_PROMPT = "user_prompt",
  SYSTEM_PROMPT = "system_prompt",
  CHAT_HISTORY = "chat_history",
  RESPONSE = "response",
  SOURCE_FILE = "source_file",
  LANGCHAIN_DOCUMENTS = "langchain_documents",
  COLLECTION_METADATA = "collection_metadata",
  CONVERTED_FILE = "converted_file",
  RETRIEVED_DOCUMENTS = "retrieved_documents",
  LLM_RESPONSE = "llm_response"
}

export enum ArtifactType {
  TEXT_PLAIN = 'text/plain',
  APPLICATION_PDF = 'application/pdf',
  IMAGE_PNG = 'image/png',
  IMAGE_JPEG = 'image/jpeg',
  APPLICATION_MSWORD = 'application/msword',
  APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  APPLICATION_VND_MS_EXCEL = 'application/vnd.ms-excel',
  APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  APPLICATION_VND_MS_POWERPOINT = 'application/vnd.ms-powerpoint',
  APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  TEXT_CSV = 'text/csv',
  APPLICATION_JSON = 'application/json',
  TEXT_MARKDOWN = 'text/markdown',
  APPLICATION_ZIP = 'application/zip',
  LANGCHAIN_DOCUMENTS_JSON = "langchain_documents_json",
  EMBEDDED_LANGCHAIN_DOCUMENTS = "embedded_langchain_documents",
  STRING = "string",
  XHTML = "xhtml",
  TEXT = "text"
}

export interface ArtifactTypeDto {
  artifact_type: ArtifactType;
  type_total: number;
}

export interface ProjectArtifactsTypesDto {
  artifact_types: ArtifactTypeDto[];
  data_reference: DataRefence;
  total: number;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type?: string;
  uploadedAt: Date;
};

export interface WorkflowItem {
  id: string;
  name: string;
  designedSteps: number;
  published: boolean;
  lastUpdated: Date;
};

export type Role = 'owner' | 'member';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
};

export interface HistoryItem {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt?: Date;
  progress?: number;
  meta?: Record<string, unknown>;
  projectId: string;
};

export interface ProjectTemplateDto {
  created_by: string;
  created_on: string;
  template_id: string;
  template_name: string;
  template_type?: string;
  template_status: string;
  updated_on: string;
}

// Template Configuration Interfaces
export interface ProjectTemplateConfigDto {
  template_metadata: TemplateMetadata;
  workflow_configuration: WorkflowConfiguration;
  workflow_structure: WorkflowStructure;
}

export interface TemplateMetadata {
  created_by: string;
  created_on: string;
  template_id: string;
  template_name: string;
  template_status: string;
  updated_on: string;
}

export interface WorkflowConfiguration {
  configuration: NodeConfiguration[];
  input_handles: InputHandles;
}

export interface NodeConfiguration {
  config: Record<string, string>;
  node_id: string;
}

export interface InputHandles {
  artifact_references: ArtifactReference[];
  values: HandleValue[];
}

export interface ArtifactReference {
  artifact_id: string;
  handle_id: string;
}

export interface HandleValue {
  handle_id: string;
  value: string;
}

export interface WorkflowStructure {
  data: WorkflowData;
  id: string;
  name: string;
}

export interface WorkflowData {
  edges: WorkflowEdge[];
  nodes: WorkflowNode[];
}

export interface WorkflowEdge {
  id: string;
  source_handle_id: string;
  source_node_id: string;
  target_handle_id: string;
  target_node_id: string;
}

export interface WorkflowNode {
  id: string;
  input_handles: NodeHandle[];
  output_handles: NodeHandle[];
  position: NodePosition;
  task: string;
  worker: string;
}

export interface NodeHandle {
  artifact_type: string;
  data_reference: DataRefence;
  id: string;
}

export interface NodePosition {
  x: number;
  y: number;
}


export interface SessionChatHistoryDto {
  artifact_hash: string;
  artifact_id: string;
  artifact_name: string;
  artifact_size: number;
  artifact_type: string;
  created_by: string;
  created_on: string;
  data_reference: DataRefence;
  source_id: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface SessionChatHistoryContentDto {
  messages: ChatMessageDto[];
}

export interface ChatMessageDto {
  role: ChatRole;
  content: string;
}

export interface ChatMessageResponseDto {
  completed_on: string;
  created_on: string;
  tasks: TaskDto[];
  updated_on: string;
  workflow_instance_id: string;
  workflow_name: string;
  workflow_status: string;
}

export interface TaskDto {
  completed_on: string;
  created_on: string;
  task_id: string;
  task_name: string;
  task_status: Status;
  task_status_comment: string;
  updated_on: string;
}

export interface WorkflowStatusDto {
  completed_on: string;
  created_on: string;
  tasks: TaskDto[];
  updated_on: string;
  workflow_instance_id: string;
  workflow_name: string;
  workflow_status: Status;
}

export type Status = "pending" | "running" | "completed" | "failed";