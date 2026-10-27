export interface EvidenceRecord { date: string; at?: string; }
export type Role = 'nutrition' | 'training' | 'followup';
export interface CoachingNote {role: Role; key: string; priority: 'normal'|'attention'|'urgent'; text: string; action: string; caseId?: string; actionTarget?: string;}
export interface CoachingAgreement extends EvidenceRecord {id: string; domain: 'nutrition'|'training'; status: 'question'|'proposed'|'accepted'|'declined'|'completed'|'superseded'; createdAt: string; context: string; reviewOn: string|null; evidence: Record<string,unknown>;}
export interface Adaptation {id: string; kind: string; status: 'pending'|'accepted'|'rejected'|'superseded'; baseRevision: number; expiresAt?: string;}
export interface AccountSnapshot {revision: number; serverNow?: string; serverDate?: string; profile: Record<string,unknown>|null; coachingCases?: CoachingAgreement[]; adaptations: Adaptation[];}
export interface CommandEnvelope {revision: number; action: string; payload: Record<string,unknown>;}
