This is not an official Google product.

This is a chrome Extension that highlights WebP images during normal browsing.
Images are surrounded by a dashed border. The color depends on the type:
- green for simple lossy (nothing from extended)
- pink for simple lossless (nothing from extended)
- red for extended (can contain transparency, animations, color profile ...)

When hovering an image, the quality/url will appear except on sites with complex
CSS. In that case, just look up the messages in the console by pressing F12.

To install, just copy the folder somewhere and load it from chrome.
Go to chrome://extensions/, click on developer mode on the top, click
on "Load Unpacked Extension" and select the extension folder.

By default, the extension is enabled. You can disable it or change its options
by clicking on its icon (it looks like the end of the WebP logo) then refresh
your page.

WARNINGS:
- THE EXTENSION IS TOTALLY NOT OPTIMIZED AND MIGHT SUCK YOUR BATTERY.
- THE EXTENSION MIGHT TOTALLY MISS SOME WEBP IMAGES. IF SO, PLEASE CONTACT THE
MAINTAINER OF THE EXTENSION.
