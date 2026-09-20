package e2e

import (
	"context"
	"reflect"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline"
)

func TestLocalPipelineFixture(t *testing.T) {
	r := pipeline.New()
	var got []pipeline.StepName
	for _, name := range pipeline.CoreSteps {
		name := name
		r.Register(name, func(context.Context) error { got = append(got, name); return nil })
	}
	if _, err := r.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, pipeline.CoreSteps) {
		t.Fatalf("pipeline order = %v, want %v", got, pipeline.CoreSteps)
	}
}
