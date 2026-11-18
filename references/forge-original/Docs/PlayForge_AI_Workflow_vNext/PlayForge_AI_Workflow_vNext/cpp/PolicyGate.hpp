#pragma once
// PlayForge design reference, C++20. Pure policy predicates only.
// Inputs MUST be created by trusted server components, never accepted as
// authorization claims from an MCP client. Not a legal-policy interpreter.
#include <cstdint>
#include <cmath>
#include <optional>
#include <span>
#include <string>

namespace PF::AI {
enum class EPurpose : std::uint8_t {
    ServiceAudit, ProjectAssist, WorkflowOptimization, ModelTraining,
    MarketingAnalytics, PublicShowcase, MarketingMessage
};
using FPurposeMask = std::uint32_t;
constexpr FPurposeMask Bit(EPurpose p) { return 1u << static_cast<unsigned>(p); }
constexpr FPurposeMask AllPurposes = (1u << 7u) - 1u;
constexpr bool Allows(FPurposeMask m, EPurpose p) { return (m & Bit(p)) != 0; }

enum class EPayload { MetricsOnly, ScopedContent, Credentials };
enum class EDecision {
    Allowed, Unauthorized, UnreviewedLegalBasis, SecretPayload,
    MissingLineage, PolicyUnknownOrExpired, ProviderRestricted,
    OrganizationRestricted, ProjectRestricted, ContributorRightsMissing,
    ConsentMissingAtCollection, ConsentWithdrawn, PayloadRestricted
};
struct FSourceGrant {
    std::string SourceId;
    std::string PolicyId;
    std::uint64_t PolicyRevision = 0;
    std::uint64_t ValidUntilUnixSeconds = 0;
    bool PolicyReviewed = false;
    FPurposeMask ProviderAllowed = 0;
    FPurposeMask OrganizationAllowed = 0;
    FPurposeMask ProjectAllowed = 0;
    FPurposeMask ContributorRights = 0;
    FPurposeMask ConsentRequired = 0;
    FPurposeMask ConsentAtCollection = 0;
    FPurposeMask ConsentNow = 0;
    FPurposeMask ScopedContentAllowed = 0;
};
struct FUseContext {
    bool ActorAuthorized = false;
    bool TenantMatched = false;
    bool LawfulBasisReviewed = false;
    std::uint64_t NowUnixSeconds = 0;
};
struct FDecision {
    EDecision Code;
    std::string SourceId;
    explicit operator bool() const { return Code == EDecision::Allowed; }
};
inline FDecision EvaluateDataUse(EPurpose purpose, EPayload payload,
                                 const FUseContext& context,
                                 std::span<const FSourceGrant> lineage) {
    if (!context.ActorAuthorized || !context.TenantMatched)
        return {EDecision::Unauthorized, {}};
    if (!context.LawfulBasisReviewed)
        return {EDecision::UnreviewedLegalBasis, {}};
    if (payload == EPayload::Credentials)
        return {EDecision::SecretPayload, {}};
    if (lineage.empty()) return {EDecision::MissingLineage, {}};
    for (const auto& s : lineage) {
        if (!s.PolicyReviewed || s.SourceId.empty() || s.PolicyId.empty()
            || s.PolicyRevision == 0 || context.NowUnixSeconds == 0
            || s.ValidUntilUnixSeconds <= context.NowUnixSeconds)
            return {EDecision::PolicyUnknownOrExpired, s.SourceId};
        if (!Allows(s.ProviderAllowed, purpose))
            return {EDecision::ProviderRestricted, s.SourceId};
        if (!Allows(s.OrganizationAllowed, purpose))
            return {EDecision::OrganizationRestricted, s.SourceId};
        if (!Allows(s.ProjectAllowed, purpose))
            return {EDecision::ProjectRestricted, s.SourceId};
        if (!Allows(s.ContributorRights, purpose))
            return {EDecision::ContributorRightsMissing, s.SourceId};
        if (Allows(s.ConsentRequired, purpose)) {
            if (!Allows(s.ConsentAtCollection, purpose))
                return {EDecision::ConsentMissingAtCollection, s.SourceId};
            if (!Allows(s.ConsentNow, purpose))
                return {EDecision::ConsentWithdrawn, s.SourceId};
        }
        if (payload == EPayload::ScopedContent
            && !Allows(s.ScopedContentAllowed, purpose))
            return {EDecision::PayloadRestricted, s.SourceId};
    }
    return {EDecision::Allowed, {}};
}

enum class ESpendAccount { PlatformIncluded, PersonalApi, PersonalSubscription, PlatformResearch };
enum class ERunPurpose { CreatorTask, PlatformExperiment };
enum class ESpendDecision { Allowed, ProviderUnapproved, WrongBudget, WrongOwner, BackgroundNotApproved };
struct FSpendContext {
    ESpendAccount Account = ESpendAccount::PlatformIncluded;
    ERunPurpose Purpose = ERunPurpose::CreatorTask;
    bool ProviderExecutionApproved = false;
    bool IsAccountOwnerRequest = false;
    bool IsBackground = false;
    bool ExplicitBackgroundApproval = false;
};
inline ESpendDecision EvaluateSpend(const FSpendContext& c) {
    if (!c.ProviderExecutionApproved) return ESpendDecision::ProviderUnapproved;
    if (c.Purpose == ERunPurpose::PlatformExperiment && c.Account != ESpendAccount::PlatformResearch)
        return ESpendDecision::WrongBudget;
    // Personal keys/subscriptions are never shared by collaborators in this MVP.
    if ((c.Account == ESpendAccount::PersonalApi || c.Account == ESpendAccount::PersonalSubscription)
        && !c.IsAccountOwnerRequest) return ESpendDecision::WrongOwner;
    if (c.Account == ESpendAccount::PersonalSubscription && c.IsBackground
        && !c.ExplicitBackgroundApproval) return ESpendDecision::BackgroundNotApproved;
    return ESpendDecision::Allowed;
}

enum class EMetricEvidence { Unavailable, ClientReported, ProviderMetered, ServerMeasured };
struct FTokenMeasurement {
    std::optional<std::uint64_t> Total;
    EMetricEvidence Evidence = EMetricEvidence::Unavailable;
};
inline bool IsVerifiedTokenMeasurement(const FTokenMeasurement& m) {
    // A server-side character count is NOT model-billed token evidence.
    return m.Total.has_value() && m.Evidence == EMetricEvidence::ProviderMetered;
}
struct FPromotionEvidence {
    bool AllRequiredTestsPassed = false;
    bool IsolationAndIntegrityPassed = false;
    bool HeldOutPassed = false;
    bool EvaluatorPinned = false;
    bool ComparableTaskModelEnvironment = false;
    bool PreregisteredSamplePlanSatisfied = false;
    bool FullTimeCoverage = false;
    bool ResourceBudgetPassed = false;
    FTokenMeasurement BaselineTokens;
    FTokenMeasurement CandidateTokens;
    // Must be calculated by a separate evaluator over comparable repeated runs.
    // This file neither calculates intervals nor proves statistical sufficiency.
    std::optional<double> TimeRatioUpper95;
    std::optional<double> TokenRatioUpper95;
    std::optional<double> QualityDifferenceLower95;
};
struct FPromotionThresholds {
    double MaxTimeRatio = 0.95;
    double MaxTokenRatio = 0.95;
    double MinQualityDifference = 0.0;
};
enum class EPromotionDecision { EligibleForReview, QualityOrSafetyFailed, InvalidProtocol, MissingEvidence, InvalidMetric, NoJointImprovement };
inline EPromotionDecision EvaluatePromotion(const FPromotionEvidence& e,
                                             const FPromotionThresholds& t = {}) {
    if (!e.AllRequiredTestsPassed || !e.IsolationAndIntegrityPassed || !e.HeldOutPassed
        || !e.ResourceBudgetPassed) return EPromotionDecision::QualityOrSafetyFailed;
    if (!e.EvaluatorPinned || !e.ComparableTaskModelEnvironment || !e.PreregisteredSamplePlanSatisfied)
        return EPromotionDecision::InvalidProtocol;
    if (!e.FullTimeCoverage || !IsVerifiedTokenMeasurement(e.BaselineTokens)
        || !IsVerifiedTokenMeasurement(e.CandidateTokens) || !e.TimeRatioUpper95
        || !e.TokenRatioUpper95 || !e.QualityDifferenceLower95)
        return EPromotionDecision::MissingEvidence;
    if (!std::isfinite(*e.TimeRatioUpper95) || !std::isfinite(*e.TokenRatioUpper95)
        || !std::isfinite(*e.QualityDifferenceLower95)
        || *e.TimeRatioUpper95 <= 0 || *e.TokenRatioUpper95 <= 0
        || !std::isfinite(t.MaxTimeRatio) || !std::isfinite(t.MaxTokenRatio)
        || !std::isfinite(t.MinQualityDifference) || t.MaxTimeRatio <= 0 || t.MaxTimeRatio >= 1
        || t.MaxTokenRatio <= 0 || t.MaxTokenRatio >= 1 || t.MinQualityDifference < 0)
        return EPromotionDecision::InvalidMetric;
    if (*e.TimeRatioUpper95 >= t.MaxTimeRatio || *e.TokenRatioUpper95 >= t.MaxTokenRatio
        || *e.QualityDifferenceLower95 <= t.MinQualityDifference)
        return EPromotionDecision::NoJointImprovement;
    return EPromotionDecision::EligibleForReview;
}
} // namespace PF::AI
