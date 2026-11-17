#include "PolicyGate.hpp"
#include <iostream>
#include <limits>
#include <vector>
using namespace PF::AI;
int main() {
    int checks = 0, failures = 0;
    auto check = [&](bool ok, const char* label) {
        ++checks;
        if (!ok) ++failures;
        std::cout << (ok ? "PASS " : "FAIL ") << label << '\n';
    };
    const FUseContext c{true, true, true, 1000};
    FSourceGrant s;
    s.SourceId = "synthetic-source"; s.PolicyId = "test-only-reviewed-policy";
    s.PolicyRevision = 1; s.ValidUntilUnixSeconds = 2000; s.PolicyReviewed = true;
    s.ProviderAllowed = s.OrganizationAllowed = s.ProjectAllowed = s.ContributorRights = AllPurposes;
    s.ConsentRequired = AllPurposes & ~Bit(EPurpose::ServiceAudit);
    s.ConsentAtCollection = s.ConsentNow = s.ScopedContentAllowed = AllPurposes;
    auto eval = [&](const FSourceGrant& g, EPurpose p=EPurpose::WorkflowOptimization, EPayload b=EPayload::MetricsOnly) {
        return EvaluateDataUse(p,b,c,std::span<const FSourceGrant>(&g,1)).Code;
    };
    check(eval(s)==EDecision::Allowed, "reviewed_synthetic_workflow_metrics_allowed");
    auto x=s; x.ProviderAllowed=Bit(EPurpose::ServiceAudit)|Bit(EPurpose::ProjectAssist);
    check(eval(x)==EDecision::ProviderRestricted, "provider_restriction_overrides_user_opt_in");
    check(eval(x,EPurpose::ProjectAssist)==EDecision::Allowed, "project_task_still_allowed_when_reuse_denied");
    x=s; x.PolicyReviewed=false;
    check(eval(x)==EDecision::PolicyUnknownOrExpired, "unknown_provider_profile_denied");
    x=s; x.ValidUntilUnixSeconds=1000;
    check(eval(x)==EDecision::PolicyUnknownOrExpired, "expired_profile_denied");
    x=s; x.OrganizationAllowed=0;
    check(eval(x)==EDecision::OrganizationRestricted, "organization_deny_overrides_project_allow");
    x=s; x.ProjectAllowed=0;
    check(eval(x)==EDecision::ProjectRestricted, "project_deny_enforced");
    x=s; x.ContributorRights=0;
    check(eval(x)==EDecision::ContributorRightsMissing, "contributor_rights_required");
    x=s; x.ConsentAtCollection=0;
    check(eval(x)==EDecision::ConsentMissingAtCollection, "later_opt_in_does_not_retroactively_allow_history");
    x=s; x.ConsentNow=0;
    check(eval(x)==EDecision::ConsentWithdrawn, "revocation_blocks_new_reuse");
    check(eval(x,EPurpose::ServiceAudit)==EDecision::Allowed, "separately_authorized_minimal_audit_not_optional_consent");
    x=s; x.ScopedContentAllowed=0;
    check(eval(x)==EDecision::Allowed, "metrics_and_content_permission_separate");
    check(eval(x,EPurpose::WorkflowOptimization,EPayload::ScopedContent)==EDecision::PayloadRestricted,
          "metrics_permission_does_not_allow_code_payload");
    check(eval(s,EPurpose::ServiceAudit,EPayload::Credentials)==EDecision::SecretPayload, "credentials_never_in_event_payload");
    std::vector<FSourceGrant> mixed{s,s}; mixed[1].SourceId="restricted-upstream"; mixed[1].ProviderAllowed=0;
    auto mixedResult=EvaluateDataUse(EPurpose::ModelTraining,EPayload::ScopedContent,c,mixed);
    check(mixedResult.Code==EDecision::ProviderRestricted && mixedResult.SourceId=="restricted-upstream",
          "derived_data_inherits_all_upstream_restrictions");
    check(EvaluateDataUse(EPurpose::ServiceAudit,EPayload::MetricsOnly,c,{}).Code==EDecision::MissingLineage,
          "empty_lineage_denied");
    auto badContext=c; badContext.TenantMatched=false;
    check(EvaluateDataUse(EPurpose::ProjectAssist,EPayload::MetricsOnly,badContext,mixed).Code==EDecision::Unauthorized,
          "tenant_mismatch_denied");
    badContext=c; badContext.LawfulBasisReviewed=false;
    check(EvaluateDataUse(EPurpose::ServiceAudit,EPayload::MetricsOnly,badContext,mixed).Code==EDecision::UnreviewedLegalBasis,
          "unreviewed_legal_basis_denied");
    FSpendContext spend{ESpendAccount::PersonalSubscription,ERunPurpose::CreatorTask,true,true,false,false};
    check(EvaluateSpend(spend)==ESpendDecision::Allowed, "personal_subscription_own_task_allowed_when_approved");
    spend.Purpose=ERunPurpose::PlatformExperiment;
    check(EvaluateSpend(spend)==ESpendDecision::WrongBudget, "platform_experiment_cannot_spend_personal_subscription");
    spend.Account=ESpendAccount::PersonalApi;
    check(EvaluateSpend(spend)==ESpendDecision::WrongBudget, "platform_experiment_cannot_spend_personal_api");
    spend.Account=ESpendAccount::PlatformResearch;
    check(EvaluateSpend(spend)==ESpendDecision::Allowed, "platform_experiment_uses_research_budget");
    spend.Account=ESpendAccount::PersonalSubscription; spend.Purpose=ERunPurpose::CreatorTask; spend.IsAccountOwnerRequest=false;
    check(EvaluateSpend(spend)==ESpendDecision::WrongOwner, "collaborator_cannot_spend_other_subscription");
    spend.IsAccountOwnerRequest=true; spend.IsBackground=true;
    check(EvaluateSpend(spend)==ESpendDecision::BackgroundNotApproved, "unapproved_background_subscription_use_denied");
    spend.ExplicitBackgroundApproval=true;
    check(EvaluateSpend(spend)==ESpendDecision::Allowed, "explicit_background_approval_checked");
    spend.ProviderExecutionApproved=false;
    check(EvaluateSpend(spend)==ESpendDecision::ProviderUnapproved, "execution_still_requires_provider_approval");
    check(!IsVerifiedTokenMeasurement({std::nullopt,EMetricEvidence::Unavailable}), "unknown_tokens_are_not_zero");
    check(!IsVerifiedTokenMeasurement({50,EMetricEvidence::ClientReported}), "self_reported_tokens_not_benchmark_verified");
    check(!IsVerifiedTokenMeasurement({50,EMetricEvidence::ServerMeasured}), "server_text_estimate_not_provider_token_evidence");
    FPromotionEvidence e;
    e.AllRequiredTestsPassed=e.IsolationAndIntegrityPassed=e.HeldOutPassed=e.EvaluatorPinned=true;
    e.ComparableTaskModelEnvironment=e.PreregisteredSamplePlanSatisfied=e.FullTimeCoverage=e.ResourceBudgetPassed=true;
    e.BaselineTokens={10000,EMetricEvidence::ProviderMetered};
    e.CandidateTokens={8500,EMetricEvidence::ProviderMetered};
    e.TimeRatioUpper95=0.90; e.TokenRatioUpper95=0.91; e.QualityDifferenceLower95=1.0;
    check(EvaluatePromotion(e)==EPromotionDecision::EligibleForReview, "synthetic_joint_improvement_eligible_not_auto_deployed");
    auto p=e; p.CandidateTokens={std::nullopt,EMetricEvidence::Unavailable};
    check(EvaluatePromotion(p)==EPromotionDecision::MissingEvidence, "no_all_metrics_claim_without_tokens");
    p=e; p.FullTimeCoverage=false;
    check(EvaluatePromotion(p)==EPromotionDecision::MissingEvidence, "tool_window_is_not_full_task_time");
    p=e; p.HeldOutPassed=false;
    check(EvaluatePromotion(p)==EPromotionDecision::QualityOrSafetyFailed, "held_out_failure_blocks_promotion");
    p=e; p.EvaluatorPinned=false;
    check(EvaluatePromotion(p)==EPromotionDecision::InvalidProtocol, "changed_evaluator_blocks_promotion");
    p=e; p.TimeRatioUpper95=1.01;
    check(EvaluatePromotion(p)==EPromotionDecision::NoJointImprovement, "token_gain_cannot_hide_time_regression");
    p=e; p.QualityDifferenceLower95=0.0;
    check(EvaluatePromotion(p)==EPromotionDecision::NoJointImprovement, "quality_noninferiority_is_not_superiority");
    p=e; p.TokenRatioUpper95=std::numeric_limits<double>::quiet_NaN();
    check(EvaluatePromotion(p)==EPromotionDecision::InvalidMetric, "nan_rejected");
    p=e; p.ResourceBudgetPassed=false;
    check(EvaluatePromotion(p)==EPromotionDecision::QualityOrSafetyFailed, "resource_regression_blocks_promotion");
    std::cout << "SUMMARY " << checks << " checks, " << failures << " failures\n";
    return failures==0 ? 0 : 1;
}
