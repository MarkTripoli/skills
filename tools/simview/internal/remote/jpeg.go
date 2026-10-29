package remote

import (
	"bytes"
	"image"
	"image/jpeg"
	"io"
)

func jpegEncode(w io.Writer, img image.Image) error {
	return jpeg.Encode(w, img, &jpeg.Options{Quality: jpegQuality})
}

func jpegDecode(b []byte) (image.Image, error) { return jpeg.Decode(bytes.NewReader(b)) }
