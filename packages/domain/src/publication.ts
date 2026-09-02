export type PublicationFormat="MARKDOWN"|"LATEX"|"HTML"
export interface PublicationBuildRequest { documentId:string; formats:PublicationFormat[]; includeFormalAppendix:boolean; includeReproducibilityAppendix:boolean }
export interface PublicationBuildResult { publicationId:string; artifactPaths:string[]; warnings:string[] }
export interface PublicationInspection { publicationId:string; brokenReferences:string[]; lossWarnings:string[]; trustLabelsPresent:boolean }
