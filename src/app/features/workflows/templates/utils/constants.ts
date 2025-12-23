import { ChatConfig } from "./tplsInterfaces/chatTpl.interface"
import { CompareConfig } from "./tplsInterfaces/compareTpl.interface"
import { ExtractConfig } from "./tplsInterfaces/extractTpl.interface"
import { SummarizeConfig } from "./tplsInterfaces/summarizeTpl.interface"

export const CHAT_CONFIG: ChatConfig = {
    showTimestamps: true,
    showAvatars: true,
    allowMarkdown: true,
    allowEdit: false,
    allowDelete: false,
    maxLength: 4000,
    placeholder: 'Type your message...',
    enableAttachments: true,
    autoScroll: true,
    acceptedFileTypes: 'image/*,.pdf,.doc,.docx', // or specify like: 'image/*,.pdf,.doc,.docx'
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
}

export const COMPARE_CONFIG: CompareConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt'],
    maxFileSize: 10 * 1024 * 1024,
}

export const SUMMARIZE_CONFIG: SummarizeConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
}

export const EXTRACT_CONFIG: ExtractConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
}