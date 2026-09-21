package db

// Repository identity helpers live here so admission code does not need to know
// the SQL layout. Repository IDs are stable database identifiers.

// RepositoryID returns the stable ID for a checkout, or an empty string when it
// has not been registered.
func (d *DB) RepositoryID(workingPath string) (string, error) {
	r, err := d.GetRepoByPath(workingPath)
	if err != nil || r == nil {
		return "", err
	}
	return r.ID, nil
}
