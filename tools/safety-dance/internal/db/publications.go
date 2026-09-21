package db

import (
	"database/sql"
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type Publication struct {
	RunID, RepoID, Ref, Candidate, VerifiedUpstream, GateMirror string
	PublishedAt                                                 int64
}

func (d *DB) RecordPublication(p Publication) error {
	if p.RunID == "" || p.Candidate == "" || p.VerifiedUpstream != p.Candidate {
		return fmt.Errorf("publication candidate is not verified")
	}
	_, err := d.sql.Exec(`INSERT INTO publications(run_id,repo_id,ref,candidate,verified_upstream,gate_mirror,published_at) VALUES(?,?,?,?,?,?,?)`, p.RunID, p.RepoID, p.Ref, p.Candidate, p.VerifiedUpstream, p.GateMirror, now())
	if err != nil {
		return fmt.Errorf("record publication: %w", err)
	}
	return nil
}
func (d *DB) GetPublication(runID string) (*Publication, error) {
	var p Publication
	err := d.sql.QueryRow(`SELECT run_id,repo_id,ref,candidate,verified_upstream,gate_mirror,published_at FROM publications WHERE run_id=?`, runID).Scan(&p.RunID, &p.RepoID, &p.Ref, &p.Candidate, &p.VerifiedUpstream, &p.GateMirror, &p.PublishedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get publication: %w", err)
	}
	return &p, nil
}

// RecordPublicationAndBinding commits the final publication receipt while the
// run owns publication. A cancellation may race after the remote write, but
// push_active keeps the receipt eligible so the confirmed publication is not
// lost.
func (d *DB) RecordPublicationAndBinding(p Publication, binding PushBinding) error {
	if p.RunID == "" || p.Candidate == "" || p.VerifiedUpstream != p.Candidate {
		return fmt.Errorf("publication candidate is not verified")
	}
	tx, err := d.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`UPDATE runs SET last_pushed_sha=?, push_target_kind=?, push_target_fingerprint=?, push_ref=?, last_pushed_at=?, push_generation=COALESCE(push_generation,0)+1, updated_at=? WHERE id=? AND status IN (?,?,?) AND push_active=1`, binding.HeadSHA, binding.TargetKind, binding.TargetFingerprint, binding.Ref, now(), now(), p.RunID, types.RunPending, types.RunRunning, types.RunCancelled)
	if err != nil {
		return fmt.Errorf("guard publication binding: %w", err)
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return fmt.Errorf("run %s is no longer publishable", p.RunID)
	}
	if _, err = tx.Exec(`INSERT INTO publications(run_id,repo_id,ref,candidate,verified_upstream,gate_mirror,published_at) VALUES(?,?,?,?,?,?,?)`, p.RunID, p.RepoID, p.Ref, p.Candidate, p.VerifiedUpstream, p.GateMirror, now()); err != nil {
		return fmt.Errorf("record publication: %w", err)
	}
	return tx.Commit()
}
