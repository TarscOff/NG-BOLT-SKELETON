import { CompareFile } from "./tplsInterfaces/compareTpl.interface";
import { SummarizeFile } from "./tplsInterfaces/summarizeTpl.interface";

export function iconFor(f: CompareFile | SummarizeFile): string {
    const mime = f.mime?.toLowerCase();
    const ext = f.ext?.toLowerCase();

    // MIME-first routing
    if (mime) {
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('audio/')) return 'audio_file';
        if (mime.startsWith('video/')) return 'movie';
        if (mime === 'application/pdf') return 'picture_as_pdf';
        if (mime.includes('presentation')) return 'slideshow';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'table';
        if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'description';
        if (mime.includes('zip')) return 'folder_zip';
        if (mime.includes('json')) return 'data_object';
        if (mime.includes('text/')) return 'notes';
    }

    // Extension fallback
    switch (ext) {
        case 'pdf':
            return 'picture_as_pdf';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'webp':
        case 'svg':
            return 'image';
        case 'doc':
        case 'docx':
        case 'odt':
            return 'description'; // (no "docs" icon)
        case 'xls':
        case 'xlsx':
        case 'csv':
        case 'ods':
            return 'table';
        case 'ppt':
        case 'pptx':
        case 'odp':
            return 'slideshow';
        case 'mp4':
        case 'mkv':
        case 'mov':
        case 'avi':
        case 'webm':
            return 'movie';
        case 'mp3':
        case 'wav':
        case 'flac':
        case 'm4a':
            return 'audio_file';
        case 'zip':
        case 'rar':
        case '7z':
        case 'gz':
        case 'tar':
            return 'folder_zip';
        case 'txt':
        case 'md':
            return 'notes';
        case 'json':
            return 'data_object';
        case 'html':
        case 'xml':
        case 'js':
        case 'ts':
        case 'css':
        case 'scss':
        case 'java':
        case 'cs':
        case 'py':
        case 'go':
        case 'rb':
        case 'php':
            return 'code';
        default:
            return 'insert_drive_file';
    }
}