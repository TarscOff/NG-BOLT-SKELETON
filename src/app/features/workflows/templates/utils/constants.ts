import { ChatConfig } from "./chatTpl.interface"
import { CompareConfig } from "./compareTpl.interface"
import { SummarizeConfig } from "./summarizeTpl.interface"

export const CHAT_ENDPOINTS = {
    sendMessage: '/api/chat/send',
    getMessages: '/api/chat/messages',
    deleteMessage: '/api/chat/message',
    editMessage: '/api/chat/message',
    clearChat: '/api/chat/clear',
}
export const CHAT_CONFIG: ChatConfig = {
    showTimestamps: true,
    showAvatars: true,
    allowMarkdown: true,
    allowEdit: true,
    allowDelete: true,
    maxLength: 4000,
    placeholder: 'Type your message...',
    enableAttachments: false,
    autoScroll: true,
}
export const COMPARE_ENDPOINTS = {
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
export const SUMMARIZE_ENDPOINTS = {
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
    defaultLength: 'medium',
    defaultStyle: 'paragraph',
    defaultLanguage: 'en',
    availableLanguages: [
        { label: 'English', value: 'en' },
        { label: 'French', value: 'fr' },
        { label: 'Dutch', value: 'nl' },
    ],
}