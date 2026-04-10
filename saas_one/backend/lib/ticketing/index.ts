/**
 * Ticketing Module
 * 
 * Centralized ticket classification system.
 * UI components should ONLY consume classification results, never the dictionary.
 */

export {
    classifyTicket,
    classifyTicketEnhanced,
    getSkillGroupDisplayName,
    getSkillGroupIcon,
    getSkillGroupColor,
    type SkillGroup,
    type Confidence,
    type ClassificationResult,
    type EnhancedClassificationResult,
} from './classifyTicket';

// Confidence Analyzer
export {
    analyzeConfidence,
    getTopCandidates,
    type ConfidenceAnalysis,
    type ClassificationZone,
} from './confidence';

// Hybrid Classifier Resolver
export {
    resolveClassification,
    resolveAndLogClassification,
    logClassification,
    type ResolvedClassification,
    type DecisionSource,
} from './resolver';

// Re-export dictionary for backend use only (not for UI)
import dictionary from './issueDictionary.json';
export { dictionary };

