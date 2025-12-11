import { ChatConfig, ChatEndpoints } from "./tplsInterfaces/chatTpl.interface"
import { CompareConfig, CompareEndpoints } from "./tplsInterfaces/compareTpl.interface"
import { ExtractConfig, ExtractEndpoints } from "./tplsInterfaces/extractTpl.interface"
import { SummarizeConfig, SummarizeEndpoints } from "./tplsInterfaces/summarizeTpl.interface"

export const CHAT_ENDPOINTS: ChatEndpoints = {
    sendMessage: '/api/chat/send',
    getMessages: '/api/chat/messages',
    deleteMessage: '/api/chat/message',
    editMessage: '/api/chat/message',
    clearChat: '/api/chat/clear',
    uploadAttachment: '/api/chat/upload',
}
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
export const COMPARE_ENDPOINTS: CompareEndpoints = {
    uploadFiles: '/api/compare/upload',
    startComparison: '/api/compare/start',
    getComparison: '/api/compare/result',
    cancelComparison: '/api/compare/cancel',
    exportComparison: '/api/compare/export',
}
export const COMPARE_CONFIG: CompareConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt'],
    maxFileSize: 10 * 1024 * 1024,
}
export const SUMMARIZE_ENDPOINTS: SummarizeEndpoints = {
    uploadFile: '/api/summarize/upload',
    startSummarization: '/api/summarize/start',
    getSummary: '/api/summarize/result',
    cancelSummary: '/api/summarize/cancel',
    exportSummary: '/api/summarize/export',
}
export const SUMMARIZE_CONFIG: SummarizeConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
}
export const EXTRACT_ENDPOINTS: ExtractEndpoints = {
    uploadExtract: '/api/extract/upload',
    startExtract: '/api/extract/start',
    cancelExtract: '/api/extract/result',
    exportExtract: '/api/extract/cancel',
    statusExtract: '/api/extract/export',
}
export const EXTRACT_CONFIG: ExtractConfig = {
    allowedFileTypes: ['.pdf', '.docx', '.txt', '.md'],
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 5,
}