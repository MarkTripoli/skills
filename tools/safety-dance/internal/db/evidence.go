package db

import "context"

type TypedEvidence struct {
	FindingsJSON string
	Evidence     []string
}

type TypedEvidenceSink struct{ Value *TypedEvidence }
type typedEvidenceKey struct{}

func NewTypedEvidenceSink() *TypedEvidenceSink { return &TypedEvidenceSink{} }
func WithTypedEvidenceSink(ctx context.Context, sink *TypedEvidenceSink) context.Context {
	return context.WithValue(ctx, typedEvidenceKey{}, sink)
}
func TypedEvidenceSinkFrom(ctx context.Context) *TypedEvidenceSink {
	sink, _ := ctx.Value(typedEvidenceKey{}).(*TypedEvidenceSink)
	return sink
}
