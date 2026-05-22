import { Modal, Tooltip } from "bootstrap"
import {
	SelectionController,
	MainController,
	defaultStroke,
	defaultFill,
	TextProperty,
	EnvironmentVariableController,
} from "../internal"
import FileSaver from "file-saver"
import * as prettier from "prettier"
import * as SVG from "@svgdotjs/svg.js"
const parserXML = require("@prettier/plugin-xml").default

/**
 * Contains export functions and controls the "exportModal" (~dialog).
 * @class
 */
export class ExportController {
	private static readonly pngExportDPI = 1200
	private static readonly svgPixelsPerInch = 96

	private static _instance: ExportController
	public static get instance(): ExportController {
		if (!ExportController._instance) {
			ExportController._instance = new ExportController()
		}
		return ExportController._instance
	}

	private modalElement: HTMLDivElement
	private modal: Modal
	private heading: HTMLHeadingElement
	private exportedContent: HTMLTextAreaElement
	private exportedImageContainer: HTMLDivElement
	private exportedImagePreview: HTMLImageElement
	private fileBasename: HTMLInputElement
	private fileExtension: HTMLInputElement
	private fileExtensionDropdown: HTMLUListElement
	private copyButton: HTMLDivElement
	private saveButton: HTMLButtonElement

	private copyTooltip: Tooltip

	private imagePreviewURL: string | null = null

	private usedIDs: Map<string, number>
	public createExportID(prefix = "N"): string {
		let currentID: number
		if (this.usedIDs.has(prefix)) {
			currentID = this.usedIDs.get(prefix)
			currentID++
		} else {
			currentID = 1
		}
		while (this.isIDUsed(prefix + currentID)) currentID++
		this.usedIDs.set(prefix, currentID)
		return prefix + currentID
	}

	private isIDUsed(id: string): boolean {
		for (const component of MainController.instance.circuitComponents) {
			// check if another component with the same name already exists
			if ("name" in component) {
				let name = component.name as TextProperty
				if (name.value == id) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Init the ExportController
	 */
	private constructor() {
		this.modalElement = document.getElementById("exportModal") as HTMLDivElement
		this.modal = new Modal(this.modalElement)
		this.heading = document.getElementById("exportModalLabel") as HTMLHeadingElement
		this.exportedContent = document.getElementById("exportedContent") as HTMLTextAreaElement
		this.exportedImageContainer = document.getElementById("exportedImageContainer") as HTMLDivElement
		this.exportedImagePreview = document.getElementById("exportedImagePreview") as HTMLImageElement
		this.fileBasename = document.getElementById("exportModalFileBasename") as HTMLInputElement
		this.fileExtension = document.getElementById("exportModalFileExtension") as HTMLInputElement
		this.fileExtensionDropdown = document.getElementById("exportModalFileExtensionDropdown") as HTMLUListElement
		this.copyButton = document.getElementById("copyExportedContent") as HTMLDivElement
		this.saveButton = document.getElementById("exportModalSave") as HTMLButtonElement

		let copyButtonDefaultTooltipText = "Copy to clipboard"
		this.copyButton.addEventListener("hidden.bs.tooltip", (evt) => {
			this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
			this.copyTooltip.dispose()
			this.copyTooltip = new Tooltip(this.copyButton)
		})
		this.copyButton.setAttribute("data-bs-toggle", "tooltip")
		this.copyButton.setAttribute("data-bs-title", copyButtonDefaultTooltipText)
		this.copyTooltip = new Tooltip(this.copyButton)

		this.usedIDs = new Map<string, number>()
	}

	exportJSON(text: string) {
		this.heading.textContent = "Save JSON"
		this.showTextExport()

		// create extension select list
		const extensions = [".json", ".txt"]

		this.exportedContent.rows = Math.max(text.split("\n").length, 2)
		this.exportedContent.value = text

		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the CitcuiTikZ code.
	 */
	exportCircuiTikZ() {
		this.heading.innerHTML = "Export CircuiTi<i>k</i>Z code"
		this.showTextExport()
		// create extension select list
		const extensions = [".tikz", ".tex", ".pgf"]

		// actually export/create the string
		{
			let circuitElements = []
			let requiredTikzLibraries: Set<string> = new Set<string>()
			for (const circuitElement of MainController.instance.circuitComponents) {
				circuitElement.requiredTikzLibraries().forEach((item) => requiredTikzLibraries.add(item))
				circuitElements.push("\t" + circuitElement.toTikzString())
			}
			let libraryStr =
				requiredTikzLibraries.size > 0 ?
					"\\usetikzlibrary{" + requiredTikzLibraries.values().toArray().join(", ") + "}"
				:	""

			const tikzSettings = EnvironmentVariableController.instance.getTikzSettings()
			let arr = [
				"\\begin{tikzpicture}" + "[" + ["transform shape"].concat(tikzSettings.environment).join(", ") + "]",
				...tikzSettings.ctikzset.map((setting) => "\t\\ctikzset{" + setting + "}"),
				"\t% Paths, nodes and wires:",
				...circuitElements,
				"\\end{tikzpicture}",
			]
			if (libraryStr) {
				arr = [libraryStr].concat(arr)
			}
			this.exportedContent.rows = arr.length
			this.exportedContent.value = arr.join("\n")
		}
		this.usedIDs.clear()
		this.export(extensions)
	}

	/**
	 * Shows the exportModal with the SVG code.
	 */
	async exportSVG() {
		this.heading.textContent = "Export SVG"
		this.showTextExport()
		try {
			const { textContent } = await this.buildExportSVGMarkup()
			this.exportedContent.rows = textContent.split("\n").length
			this.exportedContent.value = textContent
			this.export([".svg", ".txt"])
		} catch (error) {
			console.error(error)
			alert("Failed to export SVG.")
		}
	}

	async exportPNG() {
		this.heading.textContent = `Export PNG (${ExportController.pngExportDPI} DPI)`

		try {
			const { textContent, width, height } = await this.buildExportSVGMarkup()
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
				throw new Error("The current circuit does not have a rasterizable bounding box.")
			}

			const pngBlob = await this.rasterizeSVGToPNG(textContent, width, height)
			this.showImageExport(pngBlob)
			this.export(
				[".png"],
				() => this.copyPNGToClipboard(pngBlob),
				() => FileSaver.saveAs(pngBlob, this.createExportFilename() + ".png"),
				() => this.resetImageExport()
			)
		} catch (error) {
			console.error(error)
			alert(`Failed to export a ${ExportController.pngExportDPI} DPI PNG.`)
		}
	}

	private async buildExportSVGMarkup(): Promise<{ textContent: string; width: number; height: number }> {
		SelectionController.instance.selectAll()
		SelectionController.instance.deactivateSelection()

		const colorTheme = MainController.instance.darkMode
		MainController.instance.darkMode = false
		MainController.instance.updateTheme()

		const svgObj = new SVG.Svg()
		svgObj.node.style.fontSize = "10pt"
		svgObj.node.style.overflow = "visible"

		try {
			let defsMap: Map<string, SVG.Element> = new Map<string, SVG.Element>()
			let components: SVG.Element[] = []
			for (const instance of MainController.instance.circuitComponents) {
				components.push(instance.toSVG(defsMap))
			}

			if (defsMap.size > 0) {
				const defs = new SVG.Defs()
				for (const element of defsMap) {
					defs.add(element[1])
				}
				svgObj.add(defs)
			}

			for (const component of components) {
				svgObj.add(component)
			}

			for (const removeElement of svgObj.find(
				':is([fill-opacity="0"],[fill="none"],[fill="transparent"]):is([stroke-opacity="0"],[stroke="none"],[stroke-width="0"],[stroke="transparent"])'
			)) {
				removeElement.remove()
			}
			for (const removeClass of svgObj.find(".draggable")) {
				removeClass.removeClass("draggable")
			}

			let width = 0
			let height = 0
			const bbox = svgObj.bbox()
			if (bbox) {
				bbox.x -= 2
				bbox.y -= 2
				bbox.width += 4
				bbox.height += 4
				width = bbox.width
				height = bbox.height
				svgObj.viewbox(bbox)
				svgObj.width(width)
				svgObj.height(height)
			}

			const tempDiv = document.createElement("div")
			try {
				tempDiv.appendChild(svgObj.node)
				tempDiv.innerHTML = tempDiv.innerHTML.replaceAll(defaultStroke, "#000").replaceAll(defaultFill, "#fff")
				const textContent = await prettier.format(tempDiv.innerHTML.replaceAll("<br>", "<br/>"), {
					parser: "xml",
					plugins: [parserXML],
					tabWidth: 4,
					singleAttributePerLine: true,
					xmlWhitespaceSensitivity: "preserve",
				})
				return { textContent, width, height }
			} finally {
				tempDiv.remove()
			}
		} finally {
			SelectionController.instance.activateSelection()
			MainController.instance.darkMode = colorTheme
			MainController.instance.updateTheme()
		}
	}

	private showTextExport() {
		this.resetImageExport()
		this.exportedContent.classList.remove("d-none")
		this.exportedImageContainer.classList.add("d-none")
	}

	private showImageExport(imageBlob: Blob) {
		this.resetImageExport()
		this.exportedContent.classList.add("d-none")
		this.exportedImageContainer.classList.remove("d-none")
		this.imagePreviewURL = URL.createObjectURL(imageBlob)
		this.exportedImagePreview.src = this.imagePreviewURL
	}

	private resetImageExport() {
		this.exportedImagePreview.removeAttribute("src")
		if (this.imagePreviewURL) {
			URL.revokeObjectURL(this.imagePreviewURL)
			this.imagePreviewURL = null
		}
	}

	private createExportFilename(): string {
		return (
			(this.fileBasename.value.trim() || MainController.instance.designName.value).replace(/[^a-z0-9]/gi, "_") ||
			"Circuit"
		)
	}

	private showCopyTooltip(message: string) {
		this.copyButton.setAttribute("data-bs-title", message)
		this.copyTooltip.dispose()
		this.copyTooltip = new Tooltip(this.copyButton)
		this.copyTooltip.show()
	}

	private export(
		extensions: string[],
		copyAction: () => Promise<void> | void = () => navigator.clipboard.writeText(this.exportedContent.value),
		saveAction: () => void = () =>
			FileSaver.saveAs(
				new Blob([this.exportedContent.value], { type: "text/x-tex;charset=utf-8" }),
				this.createExportFilename() + this.fileExtension.value
			),
		cleanup: () => void = () => this.showTextExport()
	) {
		const copyContent = async () => {
			try {
				await copyAction()
				this.showCopyTooltip("Copied!")
			} catch (error) {
				console.error(error)
				this.showCopyTooltip("Copy failed")
			}
		}
		// create listeners
		const hideListener = (() => {
			this.exportedContent.value = "" // free memory
			cleanup()
			this.copyButton.removeEventListener("click", copyText)
			this.saveButton.removeEventListener("click", saveAction)
			this.fileExtensionDropdown.replaceChildren()
			// "once" is not always supported:
			this.modalElement.removeEventListener("hidden.bs.modal", hideListener)
		}).bind(this)

		this.modalElement.addEventListener("hidden.bs.modal", hideListener, {
			passive: true,
			once: true,
		})

		// create extension select list
		this.fileExtension.value = extensions[0]
		this.fileExtensionDropdown.replaceChildren(
			...extensions.map((ext) => {
				const link = document.createElement("a")
				link.textContent = ext
				link.classList.add("dropdown-item")
				link.addEventListener("click", () => (this.fileExtension.value = ext), {
					passive: true,
				})
				const listElement = document.createElement("li")
				listElement.appendChild(link)
				return listElement
			})
		)

		// add listeners & show modal
		const copyText = () => {
			copyContent()
		}
		this.copyButton.addEventListener("click", copyText, { passive: true })
		this.saveButton.addEventListener("click", saveAction, { passive: true })

		this.modal.show()
	}

	private async rasterizeSVGToPNG(svgText: string, width: number, height: number): Promise<Blob> {
		const scale = ExportController.pngExportDPI / ExportController.svgPixelsPerInch
		const canvas = document.createElement("canvas")
		canvas.width = Math.max(1, Math.ceil(width * scale))
		canvas.height = Math.max(1, Math.ceil(height * scale))
		const context = canvas.getContext("2d")
		if (!context) {
			throw new Error("Unable to create a canvas rendering context.")
		}

		const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
		const svgURL = URL.createObjectURL(svgBlob)
		try {
			const image = await this.loadImage(svgURL)
			context.clearRect(0, 0, canvas.width, canvas.height)
			context.drawImage(image, 0, 0, canvas.width, canvas.height)

			const pngBlob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob(resolve, "image/png")
			})
			if (!pngBlob) {
				throw new Error("Canvas rendering completed, but PNG encoding failed.")
			}
			return pngBlob
		} finally {
			URL.revokeObjectURL(svgURL)
		}
	}

	private async loadImage(url: string): Promise<HTMLImageElement> {
		return await new Promise((resolve, reject) => {
			const image = new Image()
			image.onload = () => resolve(image)
			image.onerror = () => reject(new Error("The generated SVG could not be loaded for rasterization."))
			image.src = url
		})
	}

	private async copyPNGToClipboard(imageBlob: Blob): Promise<void> {
		try {
			if (typeof ClipboardItem != "undefined" && navigator.clipboard?.write) {
				await navigator.clipboard.write([new ClipboardItem({ [imageBlob.type]: imageBlob })])
				return
			}
		} catch (error) {
			console.error(error)
		}

		const electronRequire = (globalThis as typeof globalThis & { require?: (module: string) => any }).require
		if (typeof electronRequire == "function") {
			const { clipboard, nativeImage } = electronRequire("electron")
			clipboard.writeImage(nativeImage.createFromDataURL(await this.blobToDataURL(imageBlob)))
			return
		}

		throw new Error("Copying PNG images to the clipboard is not supported in this environment.")
	}

	private async blobToDataURL(blob: Blob): Promise<string> {
		return await new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result as string)
			reader.onerror = () => reject(reader.error ?? new Error("Unable to read the exported PNG blob."))
			reader.readAsDataURL(blob)
		})
	}
}
