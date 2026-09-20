package db

import (
	"database/sql"
	"fmt"
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
