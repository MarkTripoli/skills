package daemon

import (
	"errors"
	"sync/atomic"
)

// trustedOperatorSession is captured by the daemon before it begins serving
// requests. Mutation peers must remain in that kernel-owned session; comparing
// only a peer with one of its descendants lets a daemonized validation child
// manufacture its own accepted session.
var trustedOperatorSession atomic.Int64

// SetTrustedOperatorSession records the daemon's inherited operator session.
// A non-positive value clears the authority and makes mutation authorization
// fail closed.
func SetTrustedOperatorSession(session int64) {
	trustedOperatorSession.Store(session)
}

func operatorSession() (int64, bool) {
	session := trustedOperatorSession.Load()
	return session, session > 0
}

var processSessionIDFunc = processSessionID

// CaptureTrustedOperatorSession records the session of the daemon process.
// This must run before validation agents are started.
func CaptureTrustedOperatorSession(pid int) error {
	session, ok := processSessionIDFunc(pid)
	if !ok {
		SetTrustedOperatorSession(0)
		return errors.New("cannot determine the daemon operator process session")
	}
	SetTrustedOperatorSession(session)
	return nil
}
