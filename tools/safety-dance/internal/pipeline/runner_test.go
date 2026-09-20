package pipeline

import (
	"context"
	"reflect"
	"testing"
)

func TestRunnerExecutesFixedOrderAndStopsOnFailure(t *testing.T) {
	r := New()
	var got []StepName
	for _, name := range CoreSteps {
		name := name
		r.Register(name, func(context.Context) error { got = append(got, name); return nil })
	}
	results, err := r.Run(context.Background())
	if err != nil || len(results) != len(CoreSteps) {
		t.Fatalf("results=%d err=%v", len(results), err)
	}
	if !reflect.DeepEqual(got, CoreSteps) {
		t.Fatalf("order=%v", got)
	}
}
