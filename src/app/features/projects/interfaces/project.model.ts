export interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // TODO: Add more fields as necessary
  members?: {
    userId: string;
    role: 'owner' | 'collaborator' | 'viewer';
  }[];
  designedWorkflows?: number;
  publishedWorkflows?: number;
  filesCount?: number;
  ownerCount?: number;
  memberCount?: number;
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