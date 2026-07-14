#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <Cocoa/Cocoa.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 4) {
            printf("Usage: pdf2png <pdf-path> <page-index-1-based> <output-png-path>\n");
            return 1;
        }
        
        NSString *pdfPath = [NSString stringWithUTF8String:argv[1]];
        int pageIndex = atoi(argv[2]);
        NSString *outputPath = [NSString stringWithUTF8String:argv[3]];
        
        NSURL *pdfURL = [NSURL fileURLWithPath:pdfPath];
        PDFDocument *pdfDocument = [[PDFDocument alloc] initWithURL:pdfURL];
        if (!pdfDocument) {
            printf("Failed to open PDF document\n");
            return 1;
        }
        
        if (pageIndex <= 0 || pageIndex > [pdfDocument pageCount]) {
            printf("Page index out of bounds\n");
            return 1;
        }
        
        PDFPage *page = [pdfDocument pageAtIndex:pageIndex - 1];
        if (!page) {
            printf("Failed to get page\n");
            return 1;
        }
        
        NSRect pageRect = [page boundsForBox:kPDFDisplayBoxMediaBox];
        CGFloat dpiScale = 2.0; // Render at 2x scale for clear OCR
        NSSize size = NSMakeSize(pageRect.size.width * dpiScale, pageRect.size.height * dpiScale);
        
        NSImage *image = [[NSImage alloc] initWithSize:size];
        [image lockFocus];
        
        CGContextRef context = [[NSGraphicsContext currentContext] CGContext];
        if (!context) {
            printf("Failed to get graphics context\n");
            [image unlockFocus];
            return 1;
        }
        
        // Fill white background
        CGContextSetFillColorWithColor(context, [[NSColor whiteColor] CGColor]);
        CGContextFillRect(context, CGRectMake(0, 0, size.width, size.height));
        
        // Scale context
        CGContextScaleCTM(context, dpiScale, dpiScale);
        
        // Draw page
        [page drawWithBox:kPDFDisplayBoxMediaBox toContext:context];
        
        [image unlockFocus];
        
        NSData *tiffData = [image TIFFRepresentation];
        NSBitmapImageRep *bitmapRep = [NSBitmapImageRep imageRepWithData:tiffData];
        NSData *pngData = [bitmapRep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        
        NSError *error = nil;
        BOOL success = [pngData writeToURL:[NSURL fileURLWithPath:outputPath] options:NSDataWritingAtomic error:&error];
        if (!success) {
            printf("Failed to write PNG file: %s\n", [[error localizedDescription] UTF8String]);
            return 1;
        }
        
        printf("Success: %s\n", [outputPath UTF8String]);
    }
    return 0;
}
