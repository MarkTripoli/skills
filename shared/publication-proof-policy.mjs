const blocked = (status) => ({ allowed: false, ready: false, status });

export function decidePublicationProof(proof) {
  if (proof.mode === "draft-host-capture") {
    return { allowed: proof.captureUploadMissing === true, ready: false, status: "incomplete" };
  }
  if (proof.bypass) return blocked("incomplete");
  if (!proof.head || !proof.tested) return blocked("incomplete");
  if (proof.substantiveChanged) return blocked("stale");
  if (proof.head !== proof.tested && (!proof.artifactOnlyAdvancement || !proof.indexedArtifactsOnly)) {
    return blocked("stale");
  }
  if (proof.reviewRequired && (!proof.reviewCurrent || proof.review !== "clean")) return blocked("incomplete");
  if (proof.verificationRequired && (!proof.verificationCurrent || proof.verification !== "passed")) return blocked("incomplete");
  if (proof.capture !== "passed" || !proof.captureCurrent || !proof.captureHosted) return blocked("incomplete");
  if (!proof.commentVerified || !proof.commentDistinct || !proof.finalBodyPublished || !proof.finalBodyVerified) {
    return blocked("incomplete");
  }
  return { allowed: true, ready: true, status: "pass" };
}
