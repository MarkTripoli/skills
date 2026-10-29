package remote

import "io"

type pipeEnd struct {
	r *io.PipeReader
	w *io.PipeWriter
}

func (p *pipeEnd) Read(b []byte) (int, error)  { return p.r.Read(b) }
func (p *pipeEnd) Write(b []byte) (int, error) { return p.w.Write(b) }
func (p *pipeEnd) Close() error {
	if p.w != nil {
		return p.w.Close()
	}
	return p.r.Close()
}

// pipe returns the reading end and the writing end of an in-memory pipe.
func pipe() (*pipeEnd, *pipeEnd) {
	r, w := io.Pipe()
	return &pipeEnd{r: r}, &pipeEnd{w: w}
}
