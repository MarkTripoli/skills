package pipeline

import (
	"context"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
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
func TestRunnerStopsAfterFailedStep(t *testing.T) {
	r := New()
	called := []StepName{}
	for _, name := range CoreSteps {
		name := name
		r.Register(name, func(context.Context) error {
			called = append(called, name)
			if name == StepReview {
				return fmt.Errorf("review failed")
			}
			return nil
		})
	}
	if _, err := r.Run(context.Background()); err == nil {
		t.Fatal("expected failure")
	}
	if !reflect.DeepEqual(called, []StepName{StepIntent, StepRebase, StepReview}) {
		t.Fatalf("called=%v", called)
	}
}

func TestDurableRunnerPersistsAndSkipsCompletedSteps(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.CreateRunFromAccepted(db.RunInput{Accepted: db.AcceptedRef{RepoID: "repo", Branch: "main", GateHead: "head", LaunchNonce: "nonce"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.TransitionRunStatus(run.ID, "pending", "running"); err != nil {
		t.Fatal(err)
	}
	called := 0
	first := NewDurable(database, run.ID)
	first.Register(StepIntent, func(context.Context) error { called++; return nil })
	if _, err := first.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	second := NewDurable(database, run.ID)
	second.Register(StepIntent, func(context.Context) error { called++; return nil })
	if _, err := second.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if called != 1 {
		t.Fatalf("completed step reran %d times", called)
	}
}

func TestDurableRunnerReusesCompletedStepAfterRunHeadAdvances(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.CreateRunFromAccepted(db.RunInput{Accepted: db.AcceptedRef{RepoID: "repo", Branch: "refs/heads/main", GateHead: "head", LaunchNonce: "nonce"}, BaseSHA: "base"})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.TransitionRunStatus(run.ID, "pending", "running"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	first := NewDurable(database, run.ID)
	first.RegisterWithInputs(StepIntent, StepInputs{CandidateHead: "base", Owner: "intent"}, func(context.Context) error { calls++; return nil })
	if _, err := first.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := database.UpdateRunHeadSHA(run.ID, "after-intent"); err != nil {
		t.Fatal(err)
	}
	second := NewDurable(database, run.ID)
	second.RegisterWithInputs(StepIntent, StepInputs{CandidateHead: "base", Owner: "intent"}, func(context.Context) error { calls++; return nil })
	if _, err := second.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("completed step reran after head advance: calls=%d", calls)
	}
}

func TestDurableRunnerInvalidatesChangedInputsAndDependents(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "state.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.InsertRepoWithID("repo", "/checkout", "upstream", "main"); err != nil {
		t.Fatal(err)
	}
	run, err := database.CreateRunFromAccepted(db.RunInput{Accepted: db.AcceptedRef{RepoID: "repo", Branch: "main", GateHead: "head", LaunchNonce: "nonce"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.TransitionRunStatus(run.ID, "pending", "running"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	first := NewDurable(database, run.ID)
	first.RegisterWithInputs(StepIntent, StepInputs{CandidateHead: "head", Policy: "policy-v1", Owner: "intent"}, func(context.Context) error { calls++; return nil })
	first.RegisterWithInputs(StepRebase, StepInputs{CandidateHead: "head", Policy: "policy-v1", Owner: "rebase"}, func(context.Context) error { calls++; return nil })
	if _, err := first.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	second := NewDurable(database, run.ID)
	second.RegisterWithInputs(StepIntent, StepInputs{CandidateHead: "head", Policy: "policy-v2", Owner: "intent"}, func(context.Context) error { calls++; return nil })
	second.RegisterWithInputs(StepRebase, StepInputs{CandidateHead: "head", Policy: "policy-v2", Owner: "rebase"}, func(context.Context) error { calls++; return nil })
	if _, err := second.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if calls != 4 {
		t.Fatalf("calls=%d, want both steps invalidated", calls)
	}
}
