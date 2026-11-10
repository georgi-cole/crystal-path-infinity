import java.awt.image.BufferedImage;
import java.io.File;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import javax.imageio.ImageIO;

class VerifyStoreIcon {
    public static void main(String[] args) throws Exception {
        BufferedImage source = ImageIO.read(new File(args[2]));
        try (ZipFile archive = new ZipFile(args[0])) {
            ZipEntry entry = archive.getEntry(args[1]);
            if (entry == null) throw new IllegalStateException("Missing icon: " + args[1]);
            try (InputStream file = archive.getInputStream(entry)) {
                BufferedImage packaged = ImageIO.read(file);
                int width = source.getWidth();
                int height = source.getHeight();
                if (packaged.getWidth() != width || packaged.getHeight() != height) {
                    throw new IllegalStateException("Wrong launcher icon dimensions");
                }
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        if (source.getRGB(x, y) != packaged.getRGB(x, y)) {
                            throw new IllegalStateException("Packaged icon differs from Pawrachute source");
                        }
                    }
                }
            }
        }
        System.out.println("Verified Pawrachute launcher pixels: " + args[1]);
    }
}
